# Technical documentation — Credit Balance

Living tech design for the multi-tenant credit-balance workflow app. **Update this file whenever architecture, APIs, schema, or engine behavior changes.**

Last reviewed: 2026-08-26

---

## 1. Product summary

Classify hospital credit-balance **accounts** into **refund reasons** using an ordered **rule hierarchy**, then work them in **queues** with notes and dual-source **transactions** (EHR vs 835). Configuration is **per client** (facility) under a **tenant**.

## 2. Repository layout

```
CreditBalnace/
  apps/
    api/          Express + Prisma (port 3010)
      prisma/     schema + seed
      src/
        engine/   rule compiler, executor, payer map enrichment
        import/   CSV parse + account load
        epic/     Epic FHIR OAuth + patient sync
        routes/   HTTP API
        jobs/     cron schedules
      tests/      Vitest unit tests (no DB)
    web/          React + Vite (port 5173)
      src/pages/  screens
      src/rules/  client-side transaction anomaly detectors
  docs/           TECH, USER, TEST_CASES, TESTING
  rules/          domain notes (e.g. TRANSACTION_ANOMALIES.md)
  docker-compose.yml   MariaDB 11 host port 3307
```

## 3. Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18, React Router 6, Vite, Axios |
| API | Express, Zod, JWT (bcrypt passwords) |
| ORM / DB | Prisma → MariaDB (`mysql` provider) |
| Monorepo | pnpm workspaces |
| Tests | Vitest (API unit); expand later for web / e2e |

## 4. Domain model (core)

```
Tenant
  ├── User (role)
  ├── PayerCategory, RefundReason, RefundStatus (tenant catalogs)
  └── Client (facility)
        ├── UserClientAccess
        ├── ClientPayerMap → PayerCategory
        ├── ClientAccountMap (exclude / tag keys)
        ├── ClientRefundReason (enabled reasons)
        ├── RulePack → Rule (hierarchyRank) → groups/conditions
        ├── RuleSchedule (cron)
        ├── WorkQueue (per refund reason)
        ├── Account → Transaction (EHR | ERA_835)
        └── ImportBatch
```

**Account** uniqueness: `(clientId, patientId)`. Display key: `accountNumber`.

**Transactions:** `TransactionSource` = `EHR` | `ERA_835`. Overview anomalies live in `apps/web/src/rules/transactionAnomalies.ts` (client-side on loaded ledger).

## 5. Auth and roles

- Login: `POST /auth/login` with `{ tenantSlug, email, password }`.
  - If user has TOTP enabled → `{ requires2fa: true, pendingToken }` (5‑minute JWT, `purpose: "2fa"`).
  - Else → session JWT (`purpose: "session"`, 12h) + user + clients.
- Complete 2FA: `POST /auth/login/2fa` `{ pendingToken, code }` (6‑digit TOTP **or** backup code) → session JWT.
- Session APIs reject pending 2FA tokens.
- Password hashing: bcrypt. TOTP secrets encrypted at rest (AES‑256‑GCM; key from `TOTP_ENCRYPTION_KEY`, distinct from `JWT_SECRET`). Boot refuses weak secrets when `NODE_ENV=production` or `STRICT_SECRETS=1`.
- Session JWT: HS256 only; each request reloads user from DB (`active` + current `role`). Pending 2FA tokens cannot call APIs.
- Rate limits on login / 2FA / password change. Helmet security headers. Generic 500 responses (no raw stack/Prisma leaks).
- Write roles: VIEWER is read-only. Mapping / Epic / rule config → admin roles. Account work + hierarchy run → analyst+. Import APPLY → admin only.
- Epic URLs allowlisted (HTTPS + Epic hosts; `EPIC_ALLOWED_HOSTS` for customer endpoints).
- TOTP management (authenticated):
  - `GET /auth/2fa/status`
  - `POST /auth/2fa/setup` → QR + secret (pending until confirm)
  - `POST /auth/2fa/confirm` `{ code }` → enable + one-time backup codes
  - `POST /auth/2fa/disable` `{ password, code }`
  - `POST /auth/2fa/backup-codes` → regenerate
- Roles: `SUPER_ADMIN`, `TENANT_ADMIN`, `CLIENT_ADMIN`, `ANALYST`, `VIEWER` (see Prisma `UserRole`).
- Access: tenant scoped; client access via `UserClientAccess` or tenant-admin all-clients.
- Web: **Profile** page (`/profile`) for name, password, and OTP enrollment; login second step for OTP.
  - `PATCH /auth/profile` `{ firstName, lastName }`
  - `POST /auth/profile/password` `{ currentPassword, newPassword }`
- Web: `AdminOnly` wraps admin routes (tenant/client admin). Mapping pages live under `/admin/mappings/*`.

### API mounts (`apps/api/src/index.ts`)

| Prefix | Module |
|--------|--------|
| `/auth` | login, me |
| `/clients` | clients for tenant/user |
| `/mappings` | payer/account maps + coverage |
| `/rules` | packs, hierarchy, run, schedules, meta/fields |
| `/queues` | work queues |
| `/accounts` | list, detail, notes, status, transactions |
| `/catalog` | reasons, statuses, categories |
| `/admin` | users, clients |
| `/imports` | CSV account import + batches |
| `/epic` | Epic FHIR connection, search, sync |

## 6. Epic FHIR integration

Per-client **SMART Backend Services** connection to Epic FHIR R4. Pulls `Patient`, `Coverage`, and `Account` into local accounts; **does not** replace CSV financial columns.

| Model | Purpose |
|-------|---------|
| `ClientEpicConnection` | Client ID, encrypted RSA private key, FHIR/token URLs, scopes, MRN system OID |
| `EpicSyncRun` | Sync audit (`DRY_RUN` / `APPLY`, counts, errors) |
| `Account.epicPatientFhirId` | Stable Epic patient link for upsert |

See **[EPIC_INTEGRATION.md](./EPIC_INTEGRATION.md)** for sandbox registration, scopes, and API details.

## 7. Rule engine

**Source of truth**

| File | Responsibility |
|------|----------------|
| `engine/fields.ts` | Allowlisted account + virtual fields |
| `engine/compiler.ts` | Condition → Prisma filter and/or JS evaluate |
| `engine/payerMaps.ts` | Plan code/name → category codes |
| `engine/executor.ts` | Load pack, enrich accounts, first-match apply |

**Hierarchy semantics**

1. Rules ordered by `hierarchyRank` ascending.
2. Accounts typically only considered when `onlyUnclassified` and `refundReasonId` is null.
3. **First matching rule wins**; account is claimed; lower ranks skip that account.
4. Modes: `DRY_RUN` (record matches) | `APPLY` (update reason + change history).

**Virtual payer fields** (resolved before eval via `ClientPayerMap`):

- `primaryPayerCategory`, `secondaryPayerCategory`, `tertiaryPayerCategory`
- `anyPayerCategory` / `payerCategoryCodes` (IN against any slot)
- `payerMapped`, `payerUnmapped` (strings `"true"` / `"false"`)

**Safety:** UI/API only accept allowlisted fields; no arbitrary SQL.

## 8. Account import

- `GET /imports/accounts/fields` — target field catalog for the mapper UI
- `POST /imports/accounts/analyze` `{ csvText }` → headers, sample rows, suggested column mapping
- `POST /imports/:clientId/accounts` body: `{ csvText, mode, fileName?, columnMapping? }`
  - `columnMapping`: `{ [targetField]: sourceHeader }` from the mapping tool
- Parser: `import/csv.ts`; mapping: `import/accountImporter.ts` (aliases for auto-suggest + user override)
- Upsert key: existing `(clientId, patientId)` or accountNumber match → update; else create.
- History: `ImportBatch` (stores errors + mapping used under `errorsJson`)

Body size limit: **10mb** JSON.

## 9. Frontend routes (high level)

| Path | Page | Notes |
|------|------|-------|
| `/` | Dashboard | queues, unclassified, unmapped payers |
| `/queues` | Work queues | |
| `/accounts`, `/accounts/:id` | List / workbench | reason, notes, complete |
| `/accounts/:id/transactions` | Transaction focus | full-screen, no sidebar |
| `/import` | CSV import | |
| `/rules`, `/rules/new` | Hierarchy / builder | |
| `/admin/clients`, `/admin/users` | Admin | |
| `/admin/clients/:id/reasons` | Client reason assignment | |
| `/admin/clients/:id/epic` | Epic FHIR config + sync | AdminOnly |
| `/admin/mappings/payers` | Payer maps | AdminOnly |
| `/admin/mappings/accounts` | Account maps | AdminOnly |

Nav active state: use `end` on parent paths (e.g. `/admin/clients`) so child routes do not double-highlight.

## 10. Local runtime

| Service | Default |
|---------|---------|
| Web | http://localhost:5173 |
| API | http://localhost:3010 (`PORT`, `VITE_API_URL`) |
| MariaDB | localhost:**3307**, db `credit_balance`, user `credit` / `password` |

```bash
pnpm db:up
pnpm db:push   # or db:reset-mock
pnpm dev
pnpm test      # API unit tests
```

Seed logins: see root README (synthetic only; no production PHI).

## 11. Extension checklist

When adding a feature:

1. Schema (Prisma) + `db:push` if needed.
2. API route + Zod validation; enforce client access.
3. Engine allowlist if new rule fields.
4. Web page/route; admin vs analyst nav.
5. Seed sample if useful for demos.
6. **docs/TECH.md**, **docs/USER.md** section(s).
7. **docs/TEST_CASES.md** rows + automated test in `apps/api/tests/` when logic is pure.

## 12. Out of scope / planned

- Analyst RBAC by assigned reasons + account claim lock
- Aging / reason Excel reports
- Full production SQL dump loader (keep dumps offline; never commit PHI)
- Expanded server-side anomaly rules; e2e suite

## 13. Related docs

- [USER.md](./USER.md) — operator guide  
- [EPIC_INTEGRATION.md](./EPIC_INTEGRATION.md) — Epic FHIR setup  
- [TEST_CASES.md](./TEST_CASES.md) — test inventory  
- [TESTING.md](./TESTING.md) — how to add tests  
- [../rules/TRANSACTION_ANOMALIES.md](../rules/TRANSACTION_ANOMALIES.md)
