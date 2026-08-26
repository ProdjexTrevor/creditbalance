import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { isTenantAdmin } from "../lib/roles.js";

export const tenantsRouter = Router();

tenantsRouter.get("/current", async (req, res) => {
  const user = req.user!;
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
    },
  });
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  let clients;
  if (isTenantAdmin(user.role)) {
    clients = await prisma.client.findMany({
      where: { tenantId: user.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, active: true },
    });
  } else {
    const access = await prisma.userClientAccess.findMany({
      where: { userId: user.id },
      include: {
        client: {
          select: { id: true, name: true, code: true, active: true },
        },
      },
    });
    clients = access
      .map((a) => a.client)
      .filter((c) => c.active)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  res.json({ ...tenant, clients });
});
