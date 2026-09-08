import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { assertSafeEnv, isProduction, isVercelRuntime } from "./lib/env.js";
import { authRouter } from "./routes/auth.js";
import { tenantsRouter } from "./routes/tenants.js";
import { clientsRouter } from "./routes/clients.js";
import { mappingsRouter } from "./routes/mappings.js";
import { rulesRouter } from "./routes/rules.js";
import { queuesRouter } from "./routes/queues.js";
import { accountsRouter } from "./routes/accounts.js";
import { catalogRouter } from "./routes/catalog.js";
import { adminRouter } from "./routes/admin.js";
import { importsRouter } from "./routes/imports.js";
import { epicRouter } from "./routes/epic.js";
import { requireAuth } from "./middleware/auth.js";
import { startScheduler } from "./jobs/scheduler.js";

/** Validate secrets at runtime (skipped during Vercel build analysis). */
if (!process.env.VERCEL) {
  assertSafeEnv();
}

const app = express();
const origin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(cors({ origin, credentials: true }));
app.use((req, res, next) => {
  const limit = req.path.startsWith("/imports") ? "10mb" : "1mb";
  express.json({ limit })(req, res, next);
});
app.use(morgan(isProduction() ? "combined" : "dev"));

/** Health first — no secrets / DB required */
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    env: isVercelRuntime() ? "vercel" : "node",
  });
});

/** Fail fast on Vercel when required secrets are missing (health still works). */
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (isVercelRuntime() && isProduction()) {
    try {
      assertSafeEnv();
    } catch (e) {
      console.error("env check failed", e);
      return res.status(503).json({
        error:
          e instanceof Error
            ? e.message
            : "Server misconfigured — set JWT_SECRET and TOTP_ENCRYPTION_KEY in Vercel",
      });
    }
  }
  next();
});

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

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    const statusCode =
      typeof (err as unknown as { status?: number }).status === "number"
        ? (err as unknown as { status: number }).status
        : 500;
    const clientMessage =
      statusCode >= 500
        ? "Internal server error"
        : err.message || "Request failed";
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      error: clientMessage,
    });
  }
);

const port = process.env.PORT ? Number(process.env.PORT) : 3010;

export default app;

if (!isVercelRuntime()) {
  assertSafeEnv();
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
    startScheduler();
  });
}
