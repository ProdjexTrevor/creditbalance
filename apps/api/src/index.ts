import "dotenv/config";
import express from "express";
import cors from "cors";
import { assertSafeEnv, isProduction, isVercelRuntime } from "./lib/env.js";

if (!process.env.VERCEL) {
  assertSafeEnv();
}

const app = express();
const origin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

app.disable("x-powered-by");
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

  app.use("/auth", authRouter);
  app.use("/tenants", requireAuth, tenantsRouter);
  app.use("/clients", requireAuth, clientsRouter);
  app.use("/mappings", requireAuth, mappingsRouter);
  app.use("/rules", requireAuth, rulesRouter);
  app.use("/queues", requireAuth, queuesRouter);
  app.use("/accounts", requireAuth, accountsRouter);
  app.use("/catalog", requireAuth, catalogRouter);
  app.use("/admin", requireAuth, adminRouter);
  app.use("/imports", requireAuth, importsRouter);
  app.use("/epic", requireAuth, epicRouter);
}

const routesReady = mountAppRoutes().catch((err) => {
  console.error("Failed to mount routes", err);
});

app.use(async (req, res, next) => {
  if (req.path === "/health") return next();
  try {
    await routesReady;
    next();
  } catch (e) {
    next(e instanceof Error ? e : new Error("Route mount failed"));
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
    res.status(500).json({ error: err.message || "Internal server error" });
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
