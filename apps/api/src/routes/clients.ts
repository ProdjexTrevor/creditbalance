import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const clientsRouter = Router();

async function assertClientAccess(userId: string, tenantId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
  });
  if (!client) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.role === "TENANT_ADMIN" || user?.role === "SUPER_ADMIN") return client;
  const access = await prisma.userClientAccess.findUnique({
    where: { userId_clientId: { userId, clientId } },
  });
  return access ? client : null;
}

clientsRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (user?.role === "TENANT_ADMIN" || user?.role === "SUPER_ADMIN") {
    const clients = await prisma.client.findMany({
      where: { tenantId: req.user!.tenantId, active: true },
      orderBy: { name: "asc" },
    });
    return res.json(clients);
  }
  const access = await prisma.userClientAccess.findMany({
    where: { userId: req.user!.id },
    include: { client: true },
  });
  res.json(access.map((a) => a.client).filter((c) => c.active));
});

clientsRouter.get("/:clientId", async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });
  res.json(client);
});

const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
});

clientsRouter.post("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (user?.role !== "TENANT_ADMIN" && user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const client = await prisma.client.create({
    data: {
      tenantId: req.user!.tenantId,
      name: parsed.data.name,
      code: parsed.data.code,
    },
  });
  res.status(201).json(client);
});

export { assertClientAccess };
