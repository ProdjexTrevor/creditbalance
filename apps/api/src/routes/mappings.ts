import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { assertClientAccess } from "./clients.js";
import { getPayerMapCoverage } from "../engine/executor.js";
import { requireRole } from "../middleware/auth.js";
import { ADMIN_ROLES } from "../lib/roles.js";

export const mappingsRouter = Router();

// ─── Coverage (mapped vs unmapped primary plans) ─────────────────────────────

mappingsRouter.get("/coverage/:clientId", async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });
  const coverage = await getPayerMapCoverage(client.id);
  res.json(coverage);
});

// ─── Payer maps ──────────────────────────────────────────────────────────────

mappingsRouter.get("/payers/:clientId", async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  const maps = await prisma.clientPayerMap.findMany({
    where: { clientId: client.id },
    include: { payerCategory: true },
    orderBy: { updatedAt: "desc" },
  });
  res.json(maps);
});

const payerMapSchema = z.object({
  sourcePlanCode: z.string().optional().nullable(),
  sourcePlanName: z.string().optional().nullable(),
  payerCategoryId: z.string(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

mappingsRouter.post("/payers/:clientId", requireRole(...ADMIN_ROLES), async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });
  const parsed = payerMapSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const cat = await prisma.payerCategory.findFirst({
    where: { id: parsed.data.payerCategoryId, tenantId: req.user!.tenantId },
  });
  if (!cat) return res.status(400).json({ error: "Invalid payer category" });

  const row = await prisma.clientPayerMap.create({
    data: {
      clientId: client.id,
      sourcePlanCode: parsed.data.sourcePlanCode ?? null,
      sourcePlanName: parsed.data.sourcePlanName ?? null,
      payerCategoryId: parsed.data.payerCategoryId,
      notes: parsed.data.notes ?? null,
      active: parsed.data.active ?? true,
    },
    include: { payerCategory: true },
  });
  res.status(201).json(row);
});

mappingsRouter.patch("/payers/:clientId/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });
  const parsed = payerMapSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const existing = await prisma.clientPayerMap.findFirst({
    where: { id: req.params.id, clientId: client.id },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const row = await prisma.clientPayerMap.update({
    where: { id: existing.id },
    data: parsed.data,
    include: { payerCategory: true },
  });
  res.json(row);
});

mappingsRouter.delete("/payers/:clientId/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });
  const existing = await prisma.clientPayerMap.findFirst({
    where: { id: req.params.id, clientId: client.id },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });
  await prisma.clientPayerMap.delete({ where: { id: existing.id } });
  res.status(204).end();
});

// ─── Account maps ────────────────────────────────────────────────────────────

mappingsRouter.get("/accounts/:clientId", async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  const maps = await prisma.clientAccountMap.findMany({
    where: { clientId: client.id },
    orderBy: { updatedAt: "desc" },
  });
  res.json(maps);
});

const accountMapSchema = z.object({
  sourceAccountKey: z.string().min(1),
  accountId: z.string().optional().nullable(),
  tag: z.string().optional().nullable(),
  excluded: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

mappingsRouter.post("/accounts/:clientId", requireRole(...ADMIN_ROLES), async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });
  const parsed = accountMapSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const row = await prisma.clientAccountMap.create({
    data: {
      clientId: client.id,
      sourceAccountKey: parsed.data.sourceAccountKey,
      accountId: parsed.data.accountId ?? null,
      tag: parsed.data.tag ?? null,
      excluded: parsed.data.excluded ?? false,
      notes: parsed.data.notes ?? null,
      active: parsed.data.active ?? true,
    },
  });
  res.status(201).json(row);
});

mappingsRouter.patch("/accounts/:clientId/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });
  const parsed = accountMapSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const existing = await prisma.clientAccountMap.findFirst({
    where: { id: req.params.id, clientId: client.id },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const row = await prisma.clientAccountMap.update({
    where: { id: existing.id },
    data: parsed.data,
  });
  res.json(row);
});

mappingsRouter.delete("/accounts/:clientId/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });
  const existing = await prisma.clientAccountMap.findFirst({
    where: { id: req.params.id, clientId: client.id },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });
  await prisma.clientAccountMap.delete({ where: { id: existing.id } });
  res.status(204).end();
});
