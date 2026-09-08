import { Router } from "express";
import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { encryptAtRest } from "../lib/secretCrypto.js";
import { assertClientAccess } from "./clients.js";
import { requireRole } from "../middleware/auth.js";
import { ADMIN_ROLES } from "../lib/roles.js";
import { EPIC_SANDBOX } from "../epic/config.js";
import { assertSafeEpicEndpoints } from "../epic/urlAllowlist.js";
import {
  searchEpicPatients,
  syncEpicPatients,
  testEpicConnection,
} from "../epic/sync.js";

export const epicRouter = Router();

const adminRoles: UserRole[] = ADMIN_ROLES;

function isPemPrivateKey(pem: string): boolean {
  return (
    pem.includes("BEGIN PRIVATE KEY") ||
    pem.includes("BEGIN RSA PRIVATE KEY")
  );
}

function publicConfig(row: {
  enabled: boolean;
  environment: string;
  fhirBaseUrl: string;
  tokenUrl: string | null;
  epicClientId: string;
  privateKeyEnc: string | null;
  jwkKeyId: string | null;
  mrnSystem: string | null;
  scopes: string;
  lastTokenAt: Date | null;
  lastError: string | null;
}) {
  return {
    enabled: row.enabled,
    environment: row.environment,
    fhirBaseUrl: row.fhirBaseUrl,
    tokenUrl: row.tokenUrl,
    epicClientId: row.epicClientId,
    hasPrivateKey: Boolean(row.privateKeyEnc),
    jwkKeyId: row.jwkKeyId,
    mrnSystem: row.mrnSystem,
    scopes: row.scopes,
    lastTokenAt: row.lastTokenAt,
    lastError: row.lastError,
  };
}

epicRouter.get("/defaults", (_req, res) => {
  res.json({
    ...EPIC_SANDBOX,
    jwksUrl: "https://credit-balnace-api.vercel.app/.well-known/jwks.json",
    defaultKid: "credit-balance-sandbox",
  });
});

epicRouter.get(
  "/sandbox-setup",
  requireRole(...adminRoles),
  async (_req, res) => {
    const { loadSandboxPrivateKeyPem, sandboxKid } = await import(
      "../epic/sandboxKey.js"
    );
    const { getPublicJwksUrl, getSandboxJwks } = await import(
      "../epic/jwksStore.js"
    );

    const privateKeyPem = loadSandboxPrivateKeyPem();
    const jwksUrl = getPublicJwksUrl();
    const jwks = getSandboxJwks();
    const kid = sandboxKid();

    res.json({
      jwksUrl,
      kid,
      hasPrivateKey: Boolean(privateKeyPem),
      privateKeyPem: privateKeyPem || null,
      jwks,
      fhirBaseUrl: EPIC_SANDBOX.fhirBaseUrl,
      tokenUrl: EPIC_SANDBOX.tokenUrl,
      scopes: EPIC_SANDBOX.defaultScopes,
      epicInstructions: [
        `In Epic app settings, set Non-Production JWK Set URL to: ${jwksUrl}`,
        "Wait a few minutes after saving in Epic for key cache.",
        "Paste your Non-Production Client ID, click Fill sandbox key, Save, then Test connection.",
      ],
    });
  }
);

epicRouter.get("/:clientId/config", async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  const conn = await prisma.clientEpicConnection.findUnique({
    where: { clientId: client.id },
  });

  if (!conn) {
    return res.json({
      configured: false,
      config: null,
      defaults: EPIC_SANDBOX,
    });
  }

  res.json({
    configured: true,
    config: publicConfig(conn),
    defaults: EPIC_SANDBOX,
  });
});

const configSchema = z.object({
  enabled: z.boolean().optional(),
  environment: z.enum(["SANDBOX", "PRODUCTION"]).optional(),
  fhirBaseUrl: z.string().url().optional(),
  tokenUrl: z.string().url().nullable().optional(),
  epicClientId: z.string().min(1).max(200).optional(),
  privateKeyPem: z.string().max(16_000).nullable().optional(),
  jwkKeyId: z.string().max(200).nullable().optional(),
  mrnSystem: z.string().max(500).nullable().optional(),
  scopes: z.string().max(2000).optional(),
});

epicRouter.put(
  "/:clientId/config",
  requireRole(...adminRoles),
  async (req, res) => {
    const client = await assertClientAccess(
      req.user!.id,
      req.user!.tenantId,
      req.params.clientId
    );
    if (!client) return res.status(404).json({ error: "Client not found" });

    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const data = parsed.data;
    const existing = await prisma.clientEpicConnection.findUnique({
      where: { clientId: client.id },
    });

    try {
      if (data.fhirBaseUrl || data.tokenUrl !== undefined) {
        assertSafeEpicEndpoints(
          data.fhirBaseUrl ??
            existing?.fhirBaseUrl ??
            EPIC_SANDBOX.fhirBaseUrl,
          data.tokenUrl !== undefined
            ? data.tokenUrl
            : (existing?.tokenUrl ?? EPIC_SANDBOX.tokenUrl)
        );
      }
    } catch (e) {
      return res.status(400).json({
        error: e instanceof Error ? e.message : "Invalid Epic URL",
      });
    }

    if (data.privateKeyPem && !isPemPrivateKey(data.privateKeyPem)) {
      return res.status(400).json({
        error: "privateKeyPem must be a PEM-encoded private key",
      });
    }

    const { loadSandboxPrivateKeyPem, sandboxKid } = await import(
      "../epic/sandboxKey.js"
    );
    let pemToStore = data.privateKeyPem;
    if (pemToStore === undefined && !existing?.privateKeyEnc) {
      pemToStore = loadSandboxPrivateKeyPem();
    }

    const privateKeyEnc =
      data.privateKeyPem === null
        ? null
        : pemToStore && isPemPrivateKey(pemToStore)
          ? encryptAtRest(pemToStore)
          : existing?.privateKeyEnc;

    const resolvedKid =
      data.jwkKeyId !== undefined
        ? data.jwkKeyId
        : existing?.jwkKeyId ?? (privateKeyEnc ? sandboxKid() : null);

    const conn = await prisma.clientEpicConnection.upsert({
      where: { clientId: client.id },
      create: {
        clientId: client.id,
        enabled: data.enabled ?? false,
        environment: data.environment ?? "SANDBOX",
        fhirBaseUrl: data.fhirBaseUrl ?? EPIC_SANDBOX.fhirBaseUrl,
        tokenUrl: data.tokenUrl ?? EPIC_SANDBOX.tokenUrl,
        epicClientId: data.epicClientId ?? "",
        privateKeyEnc,
        jwkKeyId: resolvedKid,
        mrnSystem: data.mrnSystem ?? EPIC_SANDBOX.defaultMrnSystem,
        scopes: data.scopes ?? EPIC_SANDBOX.defaultScopes,
      },
      update: {
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.environment ? { environment: data.environment } : {}),
        ...(data.fhirBaseUrl ? { fhirBaseUrl: data.fhirBaseUrl } : {}),
        ...(data.tokenUrl !== undefined ? { tokenUrl: data.tokenUrl } : {}),
        ...(data.epicClientId ? { epicClientId: data.epicClientId } : {}),
        ...(privateKeyEnc !== undefined &&
        (data.privateKeyPem !== undefined || !existing?.privateKeyEnc)
          ? { privateKeyEnc }
          : {}),
        ...(resolvedKid !== undefined ? { jwkKeyId: resolvedKid } : {}),
        ...(data.mrnSystem !== undefined ? { mrnSystem: data.mrnSystem } : {}),
        ...(data.scopes ? { scopes: data.scopes } : {}),
      },
    });

    res.json({ config: publicConfig(conn) });
  }
);

epicRouter.post(
  "/:clientId/test",
  requireRole(...adminRoles),
  async (req, res) => {
    const client = await assertClientAccess(
      req.user!.id,
      req.user!.tenantId,
      req.params.clientId
    );
    if (!client) return res.status(404).json({ error: "Client not found" });

    try {
      const result = await testEpicConnection(client.id);
      res.json(result);
    } catch (e) {
      res.status(400).json({
        ok: false,
        error: e instanceof Error ? e.message : "Connection failed",
      });
    }
  }
);

const searchSchema = z.object({
  family: z.string().optional(),
  given: z.string().optional(),
  birthdate: z.string().optional(),
  mrn: z.string().optional(),
  fhirPatientId: z.string().optional(),
});

epicRouter.post(
  "/:clientId/search",
  requireRole(...adminRoles),
  async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const results = await searchEpicPatients(client.id, parsed.data);
    res.json({ results });
  } catch (e) {
    res.status(400).json({
      error: e instanceof Error ? e.message : "Epic search failed",
    });
  }
});

const syncSchema = searchSchema.extend({
  mode: z.enum(["DRY_RUN", "APPLY"]).default("DRY_RUN"),
});

epicRouter.post(
  "/:clientId/sync",
  requireRole(...adminRoles),
  async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const result = await syncEpicPatients({
      clientId: client.id,
      userId: req.user!.id,
      mode: parsed.data.mode,
      params: parsed.data,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({
      error: e instanceof Error ? e.message : "Epic sync failed",
    });
  }
});

epicRouter.get("/:clientId/runs", async (req, res) => {
  const client = await assertClientAccess(
    req.user!.id,
    req.user!.tenantId,
    req.params.clientId
  );
  if (!client) return res.status(404).json({ error: "Client not found" });

  const runs = await prisma.epicSyncRun.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json(runs);
});
