import { Router } from "express";
import { z } from "zod";
import { RuleOperator } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { assertClientAccess } from "./clients.js";
import { executeRulePack } from "../engine/executor.js";
import { isAccountField, FIELD_OPTIONS } from "../engine/fields.js";
import { requireRole } from "../middleware/auth.js";
import { ADMIN_ROLES, WRITE_ROLES } from "../lib/roles.js";

export const rulesRouter = Router();

rulesRouter.get("/meta/fields", async (req, res) => {
  const cats = await prisma.payerCategory.findMany({
    where: { tenantId: req.user!.tenantId, active: true },
    orderBy: { name: "asc" },
  });
  res.json({
    fields: FIELD_OPTIONS,
    operators: Object.values(RuleOperator),
    payerCategoryCodes: cats.map((c) => ({ code: c.code, name: c.name })),
    payerFieldHints: {
      primaryPayerCategory: "EQ medicaid | medicare | commercial ...",
      anyPayerCategory: "IN medicaid,medicare â€” true if any plan maps",
      payerMapped: 'EQ "true" or "false"',
      payerUnmapped: 'EQ "true" when primary plan code has no map',
    },
  });
});

// List packs for client
rulesRouter.get("/packs/:clientId", async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  const packs = await prisma.rulePack.findMany({
    where: { clientId: client.id },
    include: {
      rules: {
        orderBy: { hierarchyRank: "asc" },
        include: {
          targetRefundReason: true,
          _count: { select: { conditionGroups: true } },
        },
      },
      schedules: true,
      _count: { select: { runs: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json(packs);
});

const packSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
});

rulesRouter.post("/packs/:clientId", requireRole(...ADMIN_ROLES), async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });
  const parsed = packSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const pack = await prisma.rulePack.create({
    data: {
      clientId: client.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    },
  });
  res.status(201).json(pack);
});

const conditionSchema = z.object({
  field: z.string(),
  operator: z.nativeEnum(RuleOperator),
  valueJson: z.unknown().optional().nullable(),
  otherField: z.string().optional().nullable(),
  valueListId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

const ruleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  hierarchyRank: z.number().int().min(1),
  enabled: z.boolean().optional(),
  onlyUnclassified: z.boolean().optional(),
  targetRefundReasonId: z.string(),
  groups: z
    .array(
      z.object({
        sortOrder: z.number().int().optional(),
        conditions: z.array(conditionSchema).min(1),
      })
    )
    .min(1),
});

rulesRouter.post("/packs/:packId/rules", requireRole(...ADMIN_ROLES), async (req, res) => {
  const pack = await prisma.rulePack.findUnique({
    where: { id: req.params.packId },
    include: { client: true },
  });
  if (!pack || pack.client.tenantId !== req.user!.tenantId) {
    return res.status(404).json({ error: "Pack not found" });
  }
  const access = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    pack.clientId
  );
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  for (const g of parsed.data.groups) {
    for (const c of g.conditions) {
      if (!isAccountField(c.field)) {
        return res.status(400).json({ error: `Invalid field: ${c.field}` });
      }
      if (c.otherField && !isAccountField(c.otherField)) {
        return res.status(400).json({ error: `Invalid otherField: ${c.otherField}` });
      }
    }
  }

  const reason = await prisma.refundReason.findFirst({
    where: {
      id: parsed.data.targetRefundReasonId,
      tenantId: req.user!.tenantId,
    },
  });
  if (!reason) return res.status(400).json({ error: "Invalid refund reason" });

  const rule = await prisma.$transaction(async (tx) => {
    const created = await tx.rule.create({
      data: {
        rulePackId: pack.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        hierarchyRank: parsed.data.hierarchyRank,
        enabled: parsed.data.enabled ?? true,
        onlyUnclassified: parsed.data.onlyUnclassified ?? true,
        targetRefundReasonId: parsed.data.targetRefundReasonId,
      },
    });

    for (const [gi, g] of parsed.data.groups.entries()) {
      const group = await tx.ruleConditionGroup.create({
        data: {
          ruleId: created.id,
          sortOrder: g.sortOrder ?? gi,
        },
      });
      for (const [ci, c] of g.conditions.entries()) {
        await tx.ruleCondition.create({
          data: {
            groupId: group.id,
            field: c.field,
            operator: c.operator,
            valueJson: c.valueJson ?? undefined,
            otherField: c.otherField ?? null,
            valueListId: c.valueListId ?? null,
            sortOrder: c.sortOrder ?? ci,
          },
        });
      }
    }

    // Ensure work queue exists for this reason
    await tx.workQueue.upsert({
      where: {
        clientId_refundReasonId: {
          clientId: pack.clientId,
          refundReasonId: reason.id,
        },
      },
      create: {
        clientId: pack.clientId,
        refundReasonId: reason.id,
        name: reason.name,
        description: `Auto queue for ${reason.name}`,
      },
      update: {},
    });

    return tx.rule.findUnique({
      where: { id: created.id },
      include: {
        targetRefundReason: true,
        conditionGroups: { include: { conditions: true } },
      },
    });
  });

  res.status(201).json(rule);
});

// Reorder hierarchy
const reorderSchema = z.object({
  orderedRuleIds: z.array(z.string()).min(1),
});

rulesRouter.put("/packs/:packId/hierarchy", requireRole(...ADMIN_ROLES), async (req, res) => {
  const pack = await prisma.rulePack.findUnique({
    where: { id: req.params.packId },
    include: { client: true },
  });
  if (!pack || pack.client.tenantId !== req.user!.tenantId) {
    return res.status(404).json({ error: "Pack not found" });
  }
  const access = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    pack.clientId
  );
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  await prisma.$transaction(async (tx) => {
    // Temporary unique ranks to avoid collisions
    for (const [i, id] of parsed.data.orderedRuleIds.entries()) {
      await tx.rule.updateMany({
        where: { id, rulePackId: pack.id },
        data: { hierarchyRank: 10000 + i },
      });
    }
    for (const [i, id] of parsed.data.orderedRuleIds.entries()) {
      await tx.rule.updateMany({
        where: { id, rulePackId: pack.id },
        data: { hierarchyRank: i + 1 },
      });
    }
  });

  const rules = await prisma.rule.findMany({
    where: { rulePackId: pack.id },
    orderBy: { hierarchyRank: "asc" },
    include: { targetRefundReason: true },
  });
  res.json(rules);
});

// Schedule
const scheduleSchema = z.object({
  name: z.string().min(1),
  cron: z.string().min(1),
  timezone: z.string().optional(),
  enabled: z.boolean().optional(),
});

rulesRouter.post("/packs/:packId/schedules", requireRole(...ADMIN_ROLES), async (req, res) => {
  const pack = await prisma.rulePack.findUnique({
    where: { id: req.params.packId },
    include: { client: true },
  });
  if (!pack || pack.client.tenantId !== req.user!.tenantId) {
    return res.status(404).json({ error: "Pack not found" });
  }
  const access = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    pack.clientId
  );
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const schedule = await prisma.ruleSchedule.create({
    data: {
      clientId: pack.clientId,
      rulePackId: pack.id,
      name: parsed.data.name,
      cron: parsed.data.cron,
      timezone: parsed.data.timezone ?? "America/Chicago",
      enabled: parsed.data.enabled ?? true,
    },
  });
  res.status(201).json(schedule);
});

// Run hierarchy
const runSchema = z.object({
  mode: z.enum(["DRY_RUN", "APPLY"]).default("DRY_RUN"),
});

rulesRouter.post("/packs/:packId/run", requireRole(...WRITE_ROLES), async (req, res) => {
  const pack = await prisma.rulePack.findUnique({
    where: { id: req.params.packId },
    include: { client: true },
  });
  if (!pack || pack.client.tenantId !== req.user!.tenantId) {
    return res.status(404).json({ error: "Pack not found" });
  }
  const access = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    pack.clientId
  );
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const parsed = runSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const result = await executeRulePack({
    rulePackId: pack.id,
    clientId: pack.clientId,
    mode: parsed.data.mode,
    userId: req.user!.id,
  });
  res.json(result);
});

rulesRouter.get("/packs/:packId/runs", async (req, res) => {
  const pack = await prisma.rulePack.findUnique({
    where: { id: req.params.packId },
    include: { client: true },
  });
  if (!pack || pack.client.tenantId !== req.user!.tenantId) {
    return res.status(404).json({ error: "Pack not found" });
  }
  const access = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    pack.clientId
  );
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const runs = await prisma.ruleRun.findMany({
    where: { rulePackId: pack.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      _count: { select: { accounts: true } },
    },
  });
  res.json(runs);
});

// Value lists
rulesRouter.get("/value-lists/:clientId", async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  const lists = await prisma.ruleValueList.findMany({
    where: { clientId: client.id },
    include: { items: true },
    orderBy: { name: "asc" },
  });
  res.json(lists);
});

const valueListSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  values: z.array(z.string()).default([]),
});

rulesRouter.post("/value-lists/:clientId", requireRole(...ADMIN_ROLES), async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });
  const parsed = valueListSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const list = await prisma.ruleValueList.create({
    data: {
      clientId: client.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      items: {
        create: parsed.data.values.map((value) => ({ value })),
      },
    },
    include: { items: true },
  });
  res.status(201).json(list);
});
