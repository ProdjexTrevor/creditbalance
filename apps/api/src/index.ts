import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  assertSafeEnv,
  isProduction,
  isVercelRuntime,
  sanitizeEnvValue,
} from "./lib/env.js";

if (!process.env.VERCEL) {
  assertSafeEnv();
}

const app = express();
const origin =
  sanitizeEnvValue(process.env.WEB_ORIGIN) ?? "http://localhost:5173";

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(cors({ origin, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    env: isVercelRuntime() ? "vercel" : "node",
    hasJwt: Boolean(process.env.JWT_SECRET),
    hasTotp: Boolean(process.env.TOTP_ENCRYPTION_KEY),
    hasDb: Boolean(process.env.DATABASE_URL),
  });
});

app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (isVercelRuntime() && isProduction()) {
    try {
      assertSafeEnv();
    } catch (e) {
      return res.status(503).json({
        error: e instanceof Error ? e.message : "Server misconfigured",
      });
    }
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
    const detail = isProduction() ? "Internal server error" : err.message;
    res.status(500).json({ error: detail });
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
