import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { assertClientAccess } from "./clients.js";
import {
  analyzeCsvForMapping,
  importAccountsFromCsv,
  IMPORT_FIELD_DEFS,
  sampleCsvTemplate,
} from "../import/accountImporter.js";
import { requireRole } from "../middleware/auth.js";
import { ADMIN_ROLES, WRITE_ROLES } from "../lib/roles.js";

export const importsRouter = Router();

importsRouter.get("/accounts/fields", (_req, res) => {
  res.json({ fields: IMPORT_FIELD_DEFS });
});

importsRouter.get("/accounts/template", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="account-import-template.csv"'
  );
  res.send(sampleCsvTemplate());
});

/** Parse spreadsheet headers + suggest field mapping + sample values */
importsRouter.post(
  "/accounts/analyze",
  requireRole(...WRITE_ROLES),
  (req, res) => {
    const schema = z.object({ csvText: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    if (parsed.data.csvText.length > 8_000_000) {
      return res.status(400).json({ error: "CSV too large (max ~8MB)" });
    }
    const analysis = analyzeCsvForMapping(parsed.data.csvText);
    res.json(analysis);
  }
);

importsRouter.get("/:clientId/batches", async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  const batches = await prisma.importBatch.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      fileName: true,
      mode: true,
      status: true,
      rowCount: true,
      createdCount: true,
      updatedCount: true,
      skippedCount: true,
      errorCount: true,
      createdAt: true,
    },
  });
  res.json(batches);
});

const bodySchema = z.object({
  csvText: z.string().min(1),
  mode: z.enum(["DRY_RUN", "APPLY"]).default("DRY_RUN"),
  fileName: z.string().max(255).optional(),
  /** target field key → source column name from the CSV header row */
  columnMapping: z.record(z.string()).optional(),
});

importsRouter.post(
  "/:clientId/accounts",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const client = await assertClientAccess(
      req.user!.id,
      req.user!.tenantId,
      req.params.clientId
    );
    if (!client) return res.status(404).json({ error: "Client not found" });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    if (parsed.data.mode === "APPLY" && !ADMIN_ROLES.includes(req.user!.role)) {
      return res.status(403).json({ error: "Only admins can apply imports" });
    }

    if (parsed.data.csvText.length > 8_000_000) {
      return res.status(400).json({ error: "CSV too large (max ~8MB)" });
    }

    const result = await importAccountsFromCsv({
      clientId: client.id,
      csvText: parsed.data.csvText,
      mode: parsed.data.mode,
      userId: req.user!.id,
      fileName: parsed.data.fileName,
      columnMapping: parsed.data.columnMapping,
    });
    res.json(result);
  }
);
