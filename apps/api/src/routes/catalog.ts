import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { assertClientAccess } from "./clients.js";

export const catalogRouter = Router();

/** Tenant-wide reasons, or client-enabled only when ?clientId= is set */
catalogRouter.get("/refund-reasons", async (req, res) => {
  const clientId = req.query.clientId ? String(req.query.clientId) : "";

  if (clientId) {
    const client = await assertClientAccess(
      req.user!.id,
      req.user!.tenantId,
      clientId
    );
    if (!client) return res.status(404).json({ error: "Client not found" });

    const links = await prisma.clientRefundReason.findMany({
      where: { clientId, active: true },
      include: { refundReason: true },
      orderBy: { refundReason: { sortOrder: "asc" } },
    });
    // If none assigned yet, fall back to full tenant catalog so demos keep working
    if (links.length === 0) {
      const reasons = await prisma.refundReason.findMany({
        where: { tenantId: req.user!.tenantId, active: true },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      });
      return res.json(reasons);
    }
    return res.json(
      links
        .filter((l) => l.refundReason.active)
        .map((l) => l.refundReason)
    );
  }

  const reasons = await prisma.refundReason.findMany({
    where: { tenantId: req.user!.tenantId, active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  res.json(reasons);
});

catalogRouter.get("/refund-statuses", async (req, res) => {
  const statuses = await prisma.refundStatus.findMany({
    where: { tenantId: req.user!.tenantId, active: true },
    orderBy: { sortOrder: "asc" },
  });
  res.json(statuses);
});

catalogRouter.get("/payer-categories", async (req, res) => {
  const cats = await prisma.payerCategory.findMany({
    where: { tenantId: req.user!.tenantId, active: true },
    orderBy: { name: "asc" },
  });
  res.json(cats);
});
