import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { assertClientAccess } from "./clients.js";

export const queuesRouter = Router();

queuesRouter.get("/:clientId", async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  const queues = await prisma.workQueue.findMany({
    where: { clientId: client.id, active: true },
    include: { refundReason: true },
    orderBy: { name: "asc" },
  });

  const withCounts = await Promise.all(
    queues.map(async (q) => {
      const openCount = await prisma.account.count({
        where: { clientId: client.id, refundReasonId: q.refundReasonId },
      });
      return { ...q, openCount };
    })
  );

  res.json(withCounts);
});
