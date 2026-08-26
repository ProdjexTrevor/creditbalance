import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { assertClientAccess } from "./clients.js";
import { requireRole } from "../middleware/auth.js";
import { WRITE_ROLES, isTenantAdmin } from "../lib/roles.js";

export const accountsRouter = Router();

async function loadAccountForUser(accountId: string, userId: string, tenantId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      refundReason: true,
      refundStatus: true,
      notes: { orderBy: { createdAt: "desc" }, take: 100 },
      history: { orderBy: { createdAt: "desc" }, take: 50 },
      transactions: { orderBy: [{ postingDate: "asc" }, { sortOrder: "asc" }], take: 200 },
      client: { select: { id: true, name: true, code: true, tenantId: true } },
    },
  });
  if (!account || account.client.tenantId !== tenantId) return null;
  const access = await assertClientAccess(userId, tenantId, account.clientId);
  if (!access) return null;
  return account;
}

accountsRouter.get("/", async (req, res) => {
  const clientId = req.query.clientId ? String(req.query.clientId) : "";
  const reasonId = req.query.reasonId ? String(req.query.reasonId) : undefined;
  const unclassified = req.query.unclassified === "1";
  const allClients = req.query.allClients === "1";
  const search = req.query.q ? String(req.query.q).trim() : "";
  const take = Math.min(Number(req.query.take) || 500, 2000);

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (allClients) {
    if (!isTenantAdmin(user.role)) {
      return res.status(403).json({ error: "Admins only for all-clients view" });
    }

    const accounts = await prisma.account.findMany({
      where: {
        client: { tenantId: req.user!.tenantId },
        ...(reasonId ? { refundReasonId: reasonId } : {}),
        ...(unclassified ? { refundReasonId: null } : {}),
        ...(search
          ? {
              OR: [
                { accountNumber: { contains: search } },
                { patientId: { contains: search } },
                { firstName: { contains: search } },
                { lastName: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        refundReason: true,
        refundStatus: true,
        client: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ clientId: "asc" }, { admitDate: "desc" }],
      take,
    });
    return res.json(accounts);
  }

  if (!clientId) return res.status(400).json({ error: "clientId required" });

  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  const accounts = await prisma.account.findMany({
    where: {
      clientId,
      ...(reasonId ? { refundReasonId: reasonId } : {}),
      ...(unclassified ? { refundReasonId: null } : {}),
      ...(search
        ? {
            OR: [
              { accountNumber: { contains: search } },
              { patientId: { contains: search } },
              { firstName: { contains: search } },
              { lastName: { contains: search } },
            ],
          }
        : {}),
    },
    include: {
      refundReason: true,
      refundStatus: true,
      client: { select: { id: true, name: true, code: true } },
    },
    orderBy: { admitDate: "desc" },
    take,
  });
  res.json(accounts);
});

/** Next account in a work queue / filter after an optional current id */
accountsRouter.get("/queue/next", async (req, res) => {
  const clientId = String(req.query.clientId || "");
  const reasonId = req.query.reasonId ? String(req.query.reasonId) : undefined;
  const unclassified = req.query.unclassified === "1";
  const afterId = req.query.afterId ? String(req.query.afterId) : undefined;
  const statusCode = req.query.statusCode
    ? Number(req.query.statusCode)
    : undefined;

  if (!clientId) return res.status(400).json({ error: "clientId required" });

  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  let excludeCompletedId: string | undefined;
  if (statusCode != null && !Number.isNaN(statusCode)) {
    const st = await prisma.refundStatus.findFirst({
      where: { tenantId: req.user!.tenantId, code: statusCode },
    });
    if (st) {
      // prefer open / in progress when filtering queue work
    }
  }

  const completed = await prisma.refundStatus.findFirst({
    where: { tenantId: req.user!.tenantId, code: 3 },
  });
  excludeCompletedId = completed?.id;

  const whereBase = {
    clientId,
    ...(reasonId ? { refundReasonId: reasonId } : {}),
    ...(unclassified ? { refundReasonId: null } : {}),
    ...(excludeCompletedId
      ? { NOT: { refundStatusId: excludeCompletedId } }
      : {}),
  };

  let accounts = await prisma.account.findMany({
    where: whereBase,
    orderBy: [{ admitDate: "desc" }, { id: "asc" }],
    select: { id: true },
    take: 500,
  });

  if (afterId) {
    const idx = accounts.findIndex((a) => a.id === afterId);
    if (idx >= 0) accounts = accounts.slice(idx + 1);
  }

  if (!accounts.length) {
    return res.json({ next: null });
  }

  const next = await loadAccountForUser(
    accounts[0].id,
    req.user!.id,
    req.user!.tenantId
  );
  res.json({ next });
});

accountsRouter.get("/:id", async (req, res) => {
  const account = await loadAccountForUser(
    req.params.id,
    req.user!.id,
    req.user!.tenantId
  );
  if (!account) return res.status(404).json({ error: "Not found" });
  res.json(account);
});

const updateSchema = z.object({
  refundReasonId: z.string().nullable().optional(),
  refundStatusId: z.string().nullable().optional(),
  adjustmentAmount: z.number().optional().nullable(),
  note: z.string().optional().nullable(),
});

accountsRouter.patch("/:id", requireRole(...WRITE_ROLES), async (req, res) => {
  const existing = await loadAccountForUser(
    req.params.id,
    req.user!.id,
    req.user!.tenantId
  );
  if (!existing) return res.status(404).json({ error: "Not found" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const { refundReasonId, refundStatusId, adjustmentAmount, note } = parsed.data;

  if (refundReasonId) {
    const reason = await prisma.refundReason.findFirst({
      where: { id: refundReasonId, tenantId: req.user!.tenantId },
    });
    if (!reason) return res.status(400).json({ error: "Invalid refund reason" });
  }
  if (refundStatusId) {
    const status = await prisma.refundStatus.findFirst({
      where: { id: refundStatusId, tenantId: req.user!.tenantId },
    });
    if (!status) return res.status(400).json({ error: "Invalid refund status" });
  }

  const changed =
    (refundReasonId !== undefined &&
      refundReasonId !== existing.refundReasonId) ||
    (refundStatusId !== undefined &&
      refundStatusId !== existing.refundStatusId) ||
    adjustmentAmount != null ||
    Boolean(note);

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: existing.id },
      data: {
        ...(refundReasonId !== undefined
          ? { refundReasonId: refundReasonId }
          : {}),
        ...(refundStatusId !== undefined
          ? { refundStatusId: refundStatusId }
          : {}),
      },
    });

    if (changed) {
      await tx.changeHistory.create({
        data: {
          accountId: existing.id,
          userId: req.user!.id,
          refundReasonId:
            refundReasonId !== undefined
              ? refundReasonId
              : existing.refundReasonId,
          refundStatusId:
            refundStatusId !== undefined
              ? refundStatusId
              : existing.refundStatusId,
          adjustmentAmount: adjustmentAmount ?? undefined,
          source: "user",
          note: note ?? "Workbench update",
        },
      });
    }
  });

  const updated = await loadAccountForUser(
    existing.id,
    req.user!.id,
    req.user!.tenantId
  );
  res.json(updated);
});

const noteSchema = z.object({
  body: z.string().min(1).max(5000),
});

accountsRouter.post("/:id/notes", requireRole(...WRITE_ROLES), async (req, res) => {
  const existing = await loadAccountForUser(
    req.params.id,
    req.user!.id,
    req.user!.tenantId
  );
  if (!existing) return res.status(404).json({ error: "Not found" });

  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const note = await prisma.accountNote.create({
    data: {
      accountId: existing.id,
      userId: req.user!.id,
      body: parsed.data.body,
    },
  });
  res.status(201).json(note);
});

const completeSchema = z.object({
  /** Set status to Completed (code 3) by default */
  markCompleted: z.boolean().optional().default(true),
  refundReasonId: z.string().nullable().optional(),
  refundStatusId: z.string().nullable().optional(),
  note: z.string().optional().nullable(),
  /** Advance to next in same queue filter */
  goNext: z.boolean().optional().default(true),
  queueReasonId: z.string().optional().nullable(),
  queueUnclassified: z.boolean().optional().default(false),
});

accountsRouter.post("/:id/complete", requireRole(...WRITE_ROLES), async (req, res) => {
  const existing = await loadAccountForUser(
    req.params.id,
    req.user!.id,
    req.user!.tenantId
  );
  if (!existing) return res.status(404).json({ error: "Not found" });

  const parsed = completeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  let statusId = parsed.data.refundStatusId ?? undefined;
  if (parsed.data.markCompleted && statusId === undefined) {
    const completed = await prisma.refundStatus.findFirst({
      where: { tenantId: req.user!.tenantId, code: 3 },
    });
    statusId = completed?.id;
  }

  if (parsed.data.refundReasonId) {
    const reason = await prisma.refundReason.findFirst({
      where: {
        id: parsed.data.refundReasonId,
        tenantId: req.user!.tenantId,
      },
    });
    if (!reason) return res.status(400).json({ error: "Invalid refund reason" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.refundReasonId !== undefined
          ? { refundReasonId: parsed.data.refundReasonId }
          : {}),
        ...(statusId !== undefined ? { refundStatusId: statusId } : {}),
      },
    });
    await tx.changeHistory.create({
      data: {
        accountId: existing.id,
        userId: req.user!.id,
        refundReasonId:
          parsed.data.refundReasonId !== undefined
            ? parsed.data.refundReasonId
            : existing.refundReasonId,
        refundStatusId: statusId ?? existing.refundStatusId,
        source: "user",
        note: parsed.data.note ?? "Completed from workbench",
      },
    });
  });

  let next = null;
  if (parsed.data.goNext) {
    const completed = await prisma.refundStatus.findFirst({
      where: { tenantId: req.user!.tenantId, code: 3 },
    });
    const queueReasonId =
      parsed.data.queueReasonId !== undefined
        ? parsed.data.queueReasonId
        : existing.refundReasonId;

    const candidates = await prisma.account.findMany({
      where: {
        clientId: existing.clientId,
        id: { not: existing.id },
        ...(parsed.data.queueUnclassified
          ? { refundReasonId: null }
          : queueReasonId
            ? { refundReasonId: queueReasonId }
            : {}),
        ...(completed ? { NOT: { refundStatusId: completed.id } } : {}),
      },
      orderBy: [{ admitDate: "desc" }, { id: "asc" }],
      select: { id: true },
      take: 1,
    });
    if (candidates[0]) {
      next = await loadAccountForUser(
        candidates[0].id,
        req.user!.id,
        req.user!.tenantId
      );
    }
  }

  const account = await loadAccountForUser(
    existing.id,
    req.user!.id,
    req.user!.tenantId
  );

  res.json({ account, next });
});
