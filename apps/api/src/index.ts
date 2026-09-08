import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import {
  assertSafeEnv,
  isVercelRuntime,
  sanitizeEnvValue,
} from "./lib/env.js";

// Never load a local .env on Vercel — it can shadow/confuse dashboard secrets.
if (!process.env.VERCEL) {
  dotenv.config();
}

// Normalize secrets in-place (strips CR/LF from Vercel/UI paste).
for (const key of [
  "JWT_SECRET",
  "TOTP_ENCRYPTION_KEY",
  "EPIC_ENCRYPTION_KEY",
  "DATABASE_URL",
  "WEB_ORIGIN",
]) {
  const cleaned = sanitizeEnvValue(process.env[key]);
  if (cleaned !== undefined) process.env[key] = cleaned;
  else if (process.env[key] != null && !String(process.env[key]).trim()) {
    delete process.env[key];
  }
}

if (!process.env.VERCEL) {
  assertSafeEnv();
}

const app = express();
const originRaw =
  sanitizeEnvValue(process.env.WEB_ORIGIN) ?? "http://localhost:5173";
const allowedOrigins = originRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const corsOrigin =
  allowedOrigins.length <= 1
    ? allowedOrigins[0]
    : (
        requestOrigin: string | undefined,
        cb: (err: Error | null, allow?: boolean) => void
      ) => {
        cb(null, Boolean(requestOrigin && allowedOrigins.includes(requestOrigin)));
      };

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  const web =
    allowedOrigins.find((o) => o.includes("credit-balance.vercel.app")) ??
    allowedOrigins[0] ??
    "https://credit-balance.vercel.app";
  res.status(200).json({
    service: "credit-balance-api",
    health: "/health",
    app: web,
    message: "This is the API. Open the app URL in your browser.",
  });
});

app.get("/health", (_req, res) => {
  const jwt = sanitizeEnvValue(process.env.JWT_SECRET);
  const totp = sanitizeEnvValue(process.env.TOTP_ENCRYPTION_KEY);
  let envError: string | null = null;
  try {
    if (isVercelRuntime()) assertSafeEnv();
  } catch (e) {
    envError = e instanceof Error ? e.message : "env check failed";
  }
  res.status(200).json({
    status: envError ? "misconfigured" : "ok",
    env: isVercelRuntime() ? "vercel" : "node",
    hasJwt: Boolean(process.env.JWT_SECRET),
    hasTotp: Boolean(process.env.TOTP_ENCRYPTION_KEY),
    hasDb: Boolean(process.env.DATABASE_URL),
    jwtLen: jwt?.length ?? 0,
    totpLen: totp?.length ?? 0,
    envError,
  });
});

app.get("/health/db", async (_req, res) => {
  try {
    const { prisma } = await import("./lib/prisma.js");
    const started = Date.now();
    await Promise.race([
      prisma.$queryRaw`SELECT 1 AS ok`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("DB connect timeout (5s)")), 5000)
      ),
    ]);
    res.json({ status: "ok", ms: Date.now() - started });
  } catch (e) {
    res.status(503).json({
      status: "db_unreachable",
      error: e instanceof Error ? e.message : "db error",
      hint: "Allow Remote MySQL from any host (%) for this DB user on host06.prodjex.com so Vercel can connect.",
    });
  }
});

/** Epic fetches this URL (no auth) to verify JWT client assertions. */
app.get("/.well-known/jwks.json", async (_req, res) => {
  const { getSandboxJwks } = await import("./epic/jwksStore.js");
  const jwks = getSandboxJwks();
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(jwks);
});
app.get("/epic/jwks.json", (_req, res) => {
  res.redirect(302, "/.well-known/jwks.json");
});

app.use((req, res, next) => {
  if (
    req.path === "/health" ||
    req.path === "/health/db" ||
    req.path === "/.well-known/jwks.json" ||
    req.path === "/epic/jwks.json"
  ) {
    return next();
  }
  next();
});

const api = express.Router();

async function mountAppRoutes() {
  const { authRouter } = await import("./routes/auth.js");
  const { tenantsRouter } = await import("./routes/tenants.js");
  const { clientsRouter } = await import("./routes/clients.js");
  const { mappingsRouter } = await import("./routes/mappings.js");
  const { rulesRouter } = await import("./routes/rules.js");
  const { queuesRouter } = await import("./routes/queues.js");
  const { accountsRouter } = await import("./routes/accounts.js");
  const { catalogRouter } = await import("./routes/catalog.js");
  const { adminRouter } = await import("./routes/admin.js");
  const { importsRouter } = await import("./routes/imports.js");
  const { epicRouter } = await import("./routes/epic.js");
  const { requireAuth } = await import("./middleware/auth.js");

  api.use("/auth", authRouter);
  api.use("/tenants", requireAuth, tenantsRouter);
  api.use("/clients", requireAuth, clientsRouter);
  api.use("/mappings", requireAuth, mappingsRouter);
  api.use("/rules", requireAuth, rulesRouter);
  api.use("/queues", requireAuth, queuesRouter);
  api.use("/accounts", requireAuth, accountsRouter);
  api.use("/catalog", requireAuth, catalogRouter);
  api.use("/admin", requireAuth, adminRouter);
  api.use("/imports", requireAuth, importsRouter);
  api.use("/epic", requireAuth, epicRouter);
}

const routesReady = mountAppRoutes().catch((err) => {
  console.error("Failed to mount routes", err);
  throw err;
});

app.use(async (req, res, next) => {
  if (req.path === "/health") return next();
  try {
    await routesReady;
    return api(req, res, next);
  } catch (e) {
    return next(e instanceof Error ? e : new Error("Route mount failed"));
  }
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    // Include message so Vercel/Prisma failures are diagnosable (no secrets in Prisma errors).
    res.status(500).json({
      error: err.message || "Internal server error",
      name: err.name,
    });
  }
);

const port = process.env.PORT ? Number(process.env.PORT) : 3010;
export default app;

if (!isVercelRuntime()) {
  assertSafeEnv();
  void routesReady.then(async () => {
    const { startScheduler } = await import("./jobs/scheduler.js");
    app.listen(port, () => {
      console.log(`API listening on http://localhost:${port}`);
      startScheduler();
    });
  });
}
