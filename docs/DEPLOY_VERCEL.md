# Deploy to Vercel (API)

## Vercel project settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `apps/api` |
| **Framework Preset** | Express |
| **Build Command** | *(leave default — uses `apps/api/vercel.json`)* |
| **Install Command** | *(leave default — uses `apps/api/vercel.json`)* |

Do **not** set Root Directory to repo root unless you add a root `vercel.json` yourself.

## Environment variables (required for runtime)

Set in Vercel → Project → Settings → Environment Variables:

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Hosted MySQL/MariaDB URL (PlanetScale, Railway, AWS RDS, etc.) — **not** `localhost` |
| `JWT_SECRET` | Random string, 16+ characters |
| `TOTP_ENCRYPTION_KEY` | Different random string, 16+ characters |
| `WEB_ORIGIN` | Your frontend URL (e.g. `https://your-app.vercel.app`) |

Optional: `EPIC_ENCRYPTION_KEY`, `EPIC_ALLOWED_HOSTS`

## What the build does

1. `cd ../.. && pnpm install` — monorepo install from repo root
2. `pnpm run vercel-build` — **Prisma generate only** (placeholder `DATABASE_URL` if unset)
3. Vercel bundles `src/index.ts` as Express (no `tsc` step on Vercel)

## Verify after deploy

```bash
curl https://YOUR-API.vercel.app/health
# → {"status":"ok","env":"vercel"}
```

Other routes return 503 until `JWT_SECRET` and `TOTP_ENCRYPTION_KEY` are set.

## Limitations on Vercel

- **No cron scheduler** — rule schedules do not run (use Render/Railway for cron)
- **Serverless** — cold starts, 250MB bundle limit
- **MariaDB Docker** is local only — use a hosted database

## Frontend (separate project)

Create a second Vercel project:

| Setting | Value |
|---------|--------|
| Root Directory | `apps/web` |
| Framework | Vite |
| Env | `VITE_API_URL=https://YOUR-API.vercel.app` |
