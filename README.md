# Credit Balance

Multi-tenant credit balance workflow: hierarchy rules, scheduled queue classification, and per-client payer/account mapping.

## Documentation

| Doc | Audience |
|-----|----------|
| [docs/USER.md](docs/USER.md) | How to use the app (operators, analysts, admins) |
| [docs/TECH.md](docs/TECH.md) | Architecture, APIs, engine, data model |
| [docs/EPIC_INTEGRATION.md](docs/EPIC_INTEGRATION.md) | Epic FHIR connection and patient sync |
| [docs/TEST_CASES.md](docs/TEST_CASES.md) | Living test-case inventory (TC-ids) |
| [docs/TESTING.md](docs/TESTING.md) | How to run and extend automated tests |
| [docs/README.md](docs/README.md) | Docs index |

```bash
pnpm test   # API unit tests (no DB required)
```

## Stack

- **web** — React + Vite
- **api** — Express + Prisma + Zod
- **db** — MariaDB 11 (Docker)

## Quick start

```bash
# from repo root
docker compose up -d db
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

- Web: http://localhost:5173  
- API: http://localhost:3010  
- DB: `localhost:3307` (user `credit` / `password`, database `credit_balance`)

### Demo login

| Tenant | Email | Password | Role |
|--------|--------|----------|------|
| `demo` | `admin@demo.local` | `password123` | Tenant admin (all demo clients) |
| `demo` | `analyst@demo.local` | `password123` | Analyst · Main Campus |
| `demo` | `clientadmin@demo.local` | `password123` | Client admin · North Wing |
| `northstar` | `admin@northstar.local` | `password123` | Second tenant admin |

### Mock data

`pnpm db:seed` (or `pnpm db:reset-mock`) loads **synthetic-only** data into MariaDB:

- **2 tenants**: `demo`, `northstar`
- **4 clients**: Main Campus, North Wing, East Clinic, Northstar Hospital
- **~116 accounts** across scenario types (zero charge, admin adj, charity, ERA gap, patient pay patterns, Medicaid, etc.)
- Transactions, notes, payer maps, account exclusions, rule hierarchy packs, value lists

Re-run anytime; operational rows under each client are wiped and rebuilt. No production PHI.

```bash
pnpm db:up          # start MariaDB
pnpm db:reset-mock  # push schema + reseed mock
```

## Product shape

```
Tenant
  └── Client (facility)
        ├── Payer maps
        ├── Account maps (tags / exclusions)
        ├── Rule pack + hierarchy
        ├── Schedules (cron)
        └── Work queues (by refund reason)
```

**Hierarchy:** rules are evaluated top → bottom. The first matching enabled rule assigns `RefundReason`; lower rules do not run for that account.

## Key API routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/login` | Tenant-scoped login |
| GET | `/mappings/payers/:clientId` | Payer maps |
| GET | `/mappings/coverage/:clientId` | Map coverage counts |
| GET | `/mappings/accounts/:clientId` | Account maps |
| GET | `/rules/packs/:clientId` | Rule packs + hierarchy |
| POST | `/rules/packs/:packId/rules` | Create rule (form-safe fields) |
| PUT | `/rules/packs/:packId/hierarchy` | Reorder hierarchy |
| POST | `/rules/packs/:packId/run` | `{ mode: "DRY_RUN" \| "APPLY" }` |
| POST | `/rules/packs/:packId/schedules` | Cron schedule |
| GET | `/queues/:clientId` | Work queues + counts |
| POST | `/imports/:clientId/accounts` | CSV account import dry-run/apply |

Rules only allowlist Account columns (see `apps/api/src/engine/fields.ts`). No free-form SQL from the UI.

Admin UI for maps: `/admin/mappings/payers`, `/admin/mappings/accounts`.

## Seed data

Synthetic accounts only (no production PHI). Sample hierarchy mirrors common legacy rules (`$0` charges, admin adj, EMR/ERA gap, patient pay match, mapped Medicaid, unmapped review, etc.).

## Importing production SQL later

Use a separate process for `prodjexdev_creditbalance` import (structure + data stay on your machine). Map legacy `ReferralDatabase` → `Client`, and `ReferralData` → `Account`. Do not commit dumps. Prefer in-app **CSV import** for controlled loads.
