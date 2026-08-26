import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";

export const adminRouter = Router();

const adminRoles = ["SUPER_ADMIN", "TENANT_ADMIN"] as const;

function isTenantAdmin(role: UserRole) {
  return role === "SUPER_ADMIN" || role === "TENANT_ADMIN";
}

// ─── Clients ─────────────────────────────────────────────────────────────────

adminRouter.get(
  "/clients",
  requireRole(...adminRoles),
  async (req, res) => {
    const clients = await prisma.client.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            accounts: true,
            userAccess: true,
            refundReasons: true,
            rulePacks: true,
          },
        },
      },
    });
    res.json(clients);
  }
);

const clientSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  active: z.boolean().optional(),
});

adminRouter.post("/clients", requireRole(...adminRoles), async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const client = await prisma.client.create({
      data: {
        tenantId: req.user!.tenantId,
        name: parsed.data.name,
        code: parsed.data.code.toUpperCase(),
        active: parsed.data.active ?? true,
      },
    });
    res.status(201).json(client);
  } catch {
    return res.status(400).json({ error: "Client code already exists" });
  }
});

adminRouter.patch(
  "/clients/:clientId",
  requireRole(...adminRoles),
  async (req, res) => {
    const parsed = clientSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const existing = await prisma.client.findFirst({
      where: { id: req.params.clientId, tenantId: req.user!.tenantId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const client = await prisma.client.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
        ...(parsed.data.code != null
          ? { code: parsed.data.code.toUpperCase() }
          : {}),
        ...(parsed.data.active != null ? { active: parsed.data.active } : {}),
      },
    });
    res.json(client);
  }
);

// ─── Client refund reasons ───────────────────────────────────────────────────

adminRouter.get(
  "/clients/:clientId/refund-reasons",
  requireRole(...adminRoles, "CLIENT_ADMIN"),
  async (req, res) => {
    const client = await prisma.client.findFirst({
      where: { id: req.params.clientId, tenantId: req.user!.tenantId },
    });
    if (!client) return res.status(404).json({ error: "Client not found" });

    if (!isTenantAdmin(req.user!.role)) {
      const access = await prisma.userClientAccess.findUnique({
        where: {
          userId_clientId: {
            userId: req.user!.id,
            clientId: client.id,
          },
        },
      });
      if (!access) return res.status(403).json({ error: "Forbidden" });
    }

    const allReasons = await prisma.refundReason.findMany({
      where: { tenantId: req.user!.tenantId, active: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    const assigned = await prisma.clientRefundReason.findMany({
      where: { clientId: client.id },
    });
    const assignedMap = Object.fromEntries(
      assigned.map((a) => [a.refundReasonId, a])
    );

    res.json(
      allReasons.map((r) => ({
        ...r,
        assigned: Boolean(assignedMap[r.id]),
        clientLinkActive: assignedMap[r.id]?.active ?? false,
        clientLinkId: assignedMap[r.id]?.id ?? null,
      }))
    );
  }
);

const assignReasonSchema = z.object({
  refundReasonId: z.string().optional(),
  /// Create new tenant reason and assign
  create: z
    .object({
      code: z.number().int(),
      name: z.string().min(1),
      description: z.string().optional().nullable(),
    })
    .optional(),
  active: z.boolean().optional(),
});

adminRouter.post(
  "/clients/:clientId/refund-reasons",
  requireRole(...adminRoles, "CLIENT_ADMIN"),
  async (req, res) => {
    const client = await prisma.client.findFirst({
      where: { id: req.params.clientId, tenantId: req.user!.tenantId },
    });
    if (!client) return res.status(404).json({ error: "Client not found" });

    if (!isTenantAdmin(req.user!.role)) {
      const access = await prisma.userClientAccess.findUnique({
        where: {
          userId_clientId: { userId: req.user!.id, clientId: client.id },
        },
      });
      if (!access) return res.status(403).json({ error: "Forbidden" });
    }

    const parsed = assignReasonSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    let reasonId = parsed.data.refundReasonId;

    if (parsed.data.create) {
      try {
        const created = await prisma.refundReason.create({
          data: {
            tenantId: req.user!.tenantId,
            code: parsed.data.create.code,
            name: parsed.data.create.name,
            description: parsed.data.create.description ?? null,
          },
        });
        reasonId = created.id;
      } catch {
        return res
          .status(400)
          .json({ error: "Refund reason code already exists for tenant" });
      }
    }

    if (!reasonId) {
      return res.status(400).json({ error: "refundReasonId or create required" });
    }

    const reason = await prisma.refundReason.findFirst({
      where: { id: reasonId, tenantId: req.user!.tenantId },
    });
    if (!reason) return res.status(400).json({ error: "Invalid refund reason" });

    const link = await prisma.clientRefundReason.upsert({
      where: {
        clientId_refundReasonId: {
          clientId: client.id,
          refundReasonId: reason.id,
        },
      },
      create: {
        clientId: client.id,
        refundReasonId: reason.id,
        active: parsed.data.active ?? true,
      },
      update: { active: parsed.data.active ?? true },
      include: { refundReason: true },
    });

    // Ensure work queue exists
    await prisma.workQueue.upsert({
      where: {
        clientId_refundReasonId: {
          clientId: client.id,
          refundReasonId: reason.id,
        },
      },
      create: {
        clientId: client.id,
        refundReasonId: reason.id,
        name: reason.name,
      },
      update: { active: true, name: reason.name },
    });

    res.status(201).json(link);
  }
);

adminRouter.delete(
  "/clients/:clientId/refund-reasons/:reasonId",
  requireRole(...adminRoles, "CLIENT_ADMIN"),
  async (req, res) => {
    const client = await prisma.client.findFirst({
      where: { id: req.params.clientId, tenantId: req.user!.tenantId },
    });
    if (!client) return res.status(404).json({ error: "Client not found" });

    if (!isTenantAdmin(req.user!.role)) {
      const access = await prisma.userClientAccess.findUnique({
        where: {
          userId_clientId: {
            userId: req.user!.id,
            clientId: client.id,
          },
        },
      });
      if (!access) return res.status(403).json({ error: "Forbidden" });
    }

    await prisma.clientRefundReason.deleteMany({
      where: {
        clientId: client.id,
        refundReasonId: req.params.reasonId,
      },
    });
    res.status(204).end();
  }
);

// ─── Users ───────────────────────────────────────────────────────────────────

adminRouter.get("/users", requireRole(...adminRoles), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { tenantId: req.user!.tenantId },
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      active: true,
      createdAt: true,
      clientAccess: {
        include: {
          client: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });
  res.json(users);
});

const userCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum([
    "SUPER_ADMIN",
    "TENANT_ADMIN",
    "CLIENT_ADMIN",
    "ANALYST",
    "VIEWER",
  ]),
  clientIds: z.array(z.string()).default([]),
  active: z.boolean().optional(),
});

adminRouter.post("/users", requireRole(...adminRoles), async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  // Only SUPER can create SUPER
  if (
    parsed.data.role === "SUPER_ADMIN" &&
    req.user!.role !== "SUPER_ADMIN"
  ) {
    return res.status(403).json({ error: "Cannot create super admin" });
  }

  const clients = await prisma.client.findMany({
    where: {
      tenantId: req.user!.tenantId,
      id: { in: parsed.data.clientIds },
    },
  });
  if (clients.length !== parsed.data.clientIds.length) {
    return res.status(400).json({ error: "Invalid clientIds" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        tenantId: req.user!.tenantId,
        email: parsed.data.email.toLowerCase(),
        passwordHash,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        role: parsed.data.role,
        active: parsed.data.active ?? true,
        clientAccess: {
          create: parsed.data.clientIds.map((clientId) => ({ clientId })),
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        active: true,
        clientAccess: {
          include: { client: { select: { id: true, name: true, code: true } } },
        },
      },
    });
    res.status(201).json(user);
  } catch {
    return res.status(400).json({ error: "Email already exists" });
  }
});

const userUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z
    .enum([
      "SUPER_ADMIN",
      "TENANT_ADMIN",
      "CLIENT_ADMIN",
      "ANALYST",
      "VIEWER",
    ])
    .optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
  clientIds: z.array(z.string()).optional(),
});

adminRouter.patch(
  "/users/:userId",
  requireRole(...adminRoles),
  async (req, res) => {
    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const existing = await prisma.user.findFirst({
      where: { id: req.params.userId, tenantId: req.user!.tenantId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (
      parsed.data.role === "SUPER_ADMIN" &&
      req.user!.role !== "SUPER_ADMIN"
    ) {
      return res.status(403).json({ error: "Cannot assign super admin" });
    }

    if (parsed.data.clientIds) {
      const clients = await prisma.client.findMany({
        where: {
          tenantId: req.user!.tenantId,
          id: { in: parsed.data.clientIds },
        },
      });
      if (clients.length !== parsed.data.clientIds.length) {
        return res.status(400).json({ error: "Invalid clientIds" });
      }
      await prisma.userClientAccess.deleteMany({
        where: { userId: existing.id },
      });
      if (parsed.data.clientIds.length) {
        await prisma.userClientAccess.createMany({
          data: parsed.data.clientIds.map((clientId) => ({
            userId: existing.id,
            clientId,
          })),
        });
      }
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        role: parsed.data.role,
        active: parsed.data.active,
        ...(parsed.data.password
          ? { passwordHash: await bcrypt.hash(parsed.data.password, 10) }
          : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        active: true,
        clientAccess: {
          include: { client: { select: { id: true, name: true, code: true } } },
        },
      },
    });
    res.json(user);
  }
);

// Tenant refund reasons catalog (create without client assignment)
const reasonSchema = z.object({
  code: z.number().int(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

adminRouter.get(
  "/refund-reasons",
  requireRole(...adminRoles),
  async (req, res) => {
    const reasons = await prisma.refundReason.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: {
        _count: { select: { clients: true, accounts: true } },
      },
    });
    res.json(reasons);
  }
);

adminRouter.post(
  "/refund-reasons",
  requireRole(...adminRoles),
  async (req, res) => {
    const parsed = reasonSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    try {
      const reason = await prisma.refundReason.create({
        data: {
          tenantId: req.user!.tenantId,
          code: parsed.data.code,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          active: parsed.data.active ?? true,
          sortOrder: parsed.data.sortOrder ?? 0,
        },
      });
      res.status(201).json(reason);
    } catch {
      return res.status(400).json({ error: "Code already exists" });
    }
  }
);
