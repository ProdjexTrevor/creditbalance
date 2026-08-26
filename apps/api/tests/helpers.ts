/**
 * Shared test helpers for rule-engine and import unit tests.
 * Add fixtures here as new domains get automated coverage.
 */
import { RuleOperator } from "@prisma/client";
import type { LoadedCondition, LoadedRule } from "../src/engine/compiler.js";
import type { PayerMapRow } from "../src/engine/payerMaps.js";

export function cond(
  field: string,
  operator: RuleOperator,
  valueJson: unknown = null,
  otherField: string | null = null
): LoadedCondition {
  return {
    field,
    operator,
    valueJson,
    otherField,
    listValues: [],
  };
}

export function rule(
  name: string,
  conditions: LoadedCondition[],
  opts?: Partial<LoadedRule>
): LoadedRule {
  return {
    id: opts?.id ?? "rule-1",
    name,
    hierarchyRank: opts?.hierarchyRank ?? 1,
    onlyUnclassified: opts?.onlyUnclassified ?? true,
    targetRefundReasonId: opts?.targetRefundReasonId ?? "reason-1",
    groups: [{ conditions }],
    ...opts,
  };
}

/** Minimal payer map fixture */
export function mapRow(
  code: string,
  categoryCode: string,
  name?: string
): PayerMapRow {
  return {
    id: `map-${code || "name"}`,
    clientId: "client-1",
    sourcePlanCode: code || null,
    sourcePlanName: name ?? null,
    payerCategoryId: `cat-${categoryCode}`,
    notes: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    payerCategory: {
      id: `cat-${categoryCode}`,
      tenantId: "t1",
      code: categoryCode,
      name: categoryCode,
      description: null,
      active: true,
    },
  };
}

export { RuleOperator };
