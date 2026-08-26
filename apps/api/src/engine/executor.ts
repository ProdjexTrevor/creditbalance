import type { RuleRunMode } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { evaluateRule, type LoadedRule } from "./compiler.js";
import {
  buildPayerLookup,
  enrichAccountWithPayerMaps,
  type PayerMapRow,
} from "./payerMaps.js";

export type RunResult = {
  runId: string;
  matchedCount: number;
  appliedCount: number;
  status: string;
  unmappedPrimaryCount: number;
  matches: Array<{
    accountId: string;
    patientId: string;
    accountNumber: string;
    ruleId: string;
    ruleName: string;
    hierarchyRank: number;
    reasonAfterId: string;
    reasonAfterName: string;
    primaryPayerCategory?: string | null;
  }>;
};

async function loadPackRules(rulePackId: string): Promise<LoadedRule[]> {
  const rules = await prisma.rule.findMany({
    where: { rulePackId, enabled: true },
    orderBy: { hierarchyRank: "asc" },
    include: {
      conditionGroups: {
        orderBy: { sortOrder: "asc" },
        include: {
          conditions: {
            orderBy: { sortOrder: "asc" },
            include: { valueList: { include: { items: true } } },
          },
        },
      },
    },
  });

  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    hierarchyRank: r.hierarchyRank,
    onlyUnclassified: r.onlyUnclassified,
    targetRefundReasonId: r.targetRefundReasonId,
    groups: r.conditionGroups.map((g) => ({
      conditions: g.conditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        valueJson: c.valueJson,
        otherField: c.otherField,
        listValues: c.valueList?.items.map((i) => i.value) ?? [],
      })),
    })),
  }));
}

/**
 * Hierarchy executor: evaluate enabled rules in hierarchyRank order.
 * First matching rule wins for each account.
 * Accounts are enriched with ClientPayerMap categories before condition eval.
 */
export async function executeRulePack(opts: {
  rulePackId: string;
  mode: RuleRunMode;
  userId?: string;
  clientId: string;
}): Promise<RunResult> {
  const pack = await prisma.rulePack.findUniqueOrThrow({
    where: { id: opts.rulePackId },
  });
  if (pack.clientId !== opts.clientId) {
    throw new Error("Rule pack does not belong to this client");
  }

  const run = await prisma.ruleRun.create({
    data: {
      rulePackId: opts.rulePackId,
      triggeredById: opts.userId,
      mode: opts.mode,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    const rules = await loadPackRules(opts.rulePackId);
    const reasons = await prisma.refundReason.findMany();
    const reasonName = Object.fromEntries(reasons.map((r) => [r.id, r.name]));

    const accounts = await prisma.account.findMany({
      where: { clientId: opts.clientId },
    });

    const payerMaps = (await prisma.clientPayerMap.findMany({
      where: { clientId: opts.clientId, active: true },
      include: { payerCategory: true },
    })) as PayerMapRow[];
    const lookup = buildPayerLookup(payerMaps);

    // Account exclusions from mapping
    const excluded = await prisma.clientAccountMap.findMany({
      where: { clientId: opts.clientId, excluded: true, active: true },
      select: { sourceAccountKey: true, accountId: true },
    });
    const excludedKeys = new Set(
      excluded.flatMap((e) =>
        [e.sourceAccountKey, e.accountId].filter(Boolean) as string[]
      )
    );

    const matches: RunResult["matches"] = [];
    const claimed = new Set<string>();
    let unmappedPrimaryCount = 0;

    const enrichedRows: Array<{
      account: (typeof accounts)[0];
      row: Record<string, unknown>;
    }> = [];

    for (const account of accounts) {
      if (
        excludedKeys.has(account.id) ||
        excludedKeys.has(account.patientId) ||
        excludedKeys.has(account.accountNumber)
      ) {
        continue;
      }
      const enrichment = enrichAccountWithPayerMaps(account, lookup);
      if (enrichment.payerUnmapped === "true") unmappedPrimaryCount++;
      enrichedRows.push({
        account,
        row: { ...account, ...enrichment },
      });
    }

    for (const rule of rules) {
      for (const { account, row } of enrichedRows) {
        if (claimed.has(account.id)) continue;
        if (!evaluateRule(row, rule)) continue;

        claimed.add(account.id);
        matches.push({
          accountId: account.id,
          patientId: account.patientId,
          accountNumber: account.accountNumber,
          ruleId: rule.id,
          ruleName: rule.name,
          hierarchyRank: rule.hierarchyRank,
          reasonAfterId: rule.targetRefundReasonId,
          reasonAfterName: reasonName[rule.targetRefundReasonId] ?? "",
          primaryPayerCategory: row.primaryPayerCategory as string | null,
        });
      }
    }

    let appliedCount = 0;

    if (opts.mode === "APPLY" && matches.length) {
      await prisma.$transaction(async (tx) => {
        for (const m of matches) {
          const before = accounts.find((a) => a.id === m.accountId);
          await tx.account.update({
            where: { id: m.accountId },
            data: { refundReasonId: m.reasonAfterId },
          });
          await tx.changeHistory.create({
            data: {
              accountId: m.accountId,
              userId: opts.userId,
              refundReasonId: m.reasonAfterId,
              source: "rule_engine",
              note: `Hierarchy rule: ${m.ruleName} (rank ${m.hierarchyRank})${
                m.primaryPayerCategory
                  ? ` · payer=${m.primaryPayerCategory}`
                  : ""
              }`,
            },
          });
          await tx.ruleRunAccount.create({
            data: {
              ruleRunId: run.id,
              accountId: m.accountId,
              matchedRuleId: m.ruleId,
              reasonBeforeId: before?.refundReasonId ?? null,
              reasonAfterId: m.reasonAfterId,
              applied: true,
            },
          });
          appliedCount++;
        }
      });
    } else if (matches.length) {
      await prisma.ruleRunAccount.createMany({
        data: matches.map((m) => {
          const before = accounts.find((a) => a.id === m.accountId);
          return {
            ruleRunId: run.id,
            accountId: m.accountId,
            matchedRuleId: m.ruleId,
            reasonBeforeId: before?.refundReasonId ?? null,
            reasonAfterId: m.reasonAfterId,
            applied: false,
          };
        }),
      });
    }

    await prisma.ruleRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        matchedCount: matches.length,
        appliedCount,
        finishedAt: new Date(),
      },
    });

    return {
      runId: run.id,
      matchedCount: matches.length,
      appliedCount,
      status: "COMPLETED",
      unmappedPrimaryCount,
      matches,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Run failed";
    await prisma.ruleRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
    throw e;
  }
}

/** Summary of map coverage for a client (dashboard / mapping UI) */
export async function getPayerMapCoverage(clientId: string) {
  const accounts = await prisma.account.findMany({
    where: { clientId },
    select: {
      id: true,
      accountNumber: true,
      planCode1: true,
      primaryInsurance: true,
    },
  });
  const maps = (await prisma.clientPayerMap.findMany({
    where: { clientId, active: true },
    include: { payerCategory: true },
  })) as PayerMapRow[];
  const lookup = buildPayerLookup(maps);

  let mapped = 0;
  let unmapped = 0;
  let noPlan = 0;
  const unmappedSamples: Array<{
    accountNumber: string;
    planCode1: string | null;
    primaryInsurance: string | null;
  }> = [];

  for (const a of accounts) {
    const e = enrichAccountWithPayerMaps(a, lookup);
    const hasPlan = Boolean(
      (a.planCode1 && a.planCode1.trim()) ||
        (a.primaryInsurance && a.primaryInsurance.trim())
    );
    if (!hasPlan) {
      noPlan++;
      continue;
    }
    if (e.primaryPayerCategory) mapped++;
    else {
      unmapped++;
      if (unmappedSamples.length < 25) {
        unmappedSamples.push({
          accountNumber: a.accountNumber,
          planCode1: a.planCode1,
          primaryInsurance: a.primaryInsurance,
        });
      }
    }
  }

  return {
    totalAccounts: accounts.length,
    mappedPrimary: mapped,
    unmappedPrimary: unmapped,
    noPrimaryPlan: noPlan,
    mapRowCount: maps.length,
    unmappedSamples,
  };
}
