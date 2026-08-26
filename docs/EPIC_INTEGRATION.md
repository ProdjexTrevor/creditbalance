# Epic FHIR integration

Connect Credit Balance to **Epic** via **SMART Backend Services** (system-level FHIR R4) to pull patient demographics, insurance coverage, and billing account identifiers into local **Account** records.

Last reviewed: 2026-08-19

---

## What Epic provides (and what it does not)

| Data | Epic FHIR | Credit Balance use |
|------|-----------|------------------|
| Patient name, MRN, DOB | `Patient` | Account identity fields |
| Primary / secondary / tertiary insurance | `Coverage` | Plan labels + plan codes for payer-map rules |
| Hospital account number / status | `Account` (Premium Billing) | `accountNumber`, status preview |
| Credit balance dollars, ERA ledger, Resolute extracts | **Not** in public FHIR Account | Still from **CSV import** or future financial interfaces |

Epic sandbox is useful for integration testing; production URLs and MRN identifier systems are **per customer**.

---

## Architecture

```
Admin UI (/admin/clients/:clientId/epic)
       ↓
API /epic/:clientId/*
       ↓
ClientEpicConnection (per client: client ID, encrypted RSA key, FHIR URLs, scopes)
       ↓
JWT client assertion → Epic token endpoint → Bearer access token
       ↓
FHIR R4: Patient.search / Coverage.search / Account.search
       ↓
mappers.ts → Account upsert (preserves financial columns on update)
```

**Code locations**

| Path | Role |
|------|------|
| `apps/api/src/epic/oauth.ts` | JWT assertion + token exchange |
| `apps/api/src/epic/fhirClient.ts` | FHIR HTTP client |
| `apps/api/src/epic/mappers.ts` | FHIR → Account shape |
| `apps/api/src/epic/sync.ts` | Test, search, sync runs |
| `apps/api/src/routes/epic.ts` | REST API |
| `apps/web/src/pages/AdminEpicPage.tsx` | Admin configuration UI |

**Database**

- `ClientEpicConnection` — one row per client (Epic app credentials)
- `EpicSyncRun` — audit of search/sync operations
- `Account.epicPatientFhirId`, `Account.epicAccountFhirId`, `Account.lastEpicSyncAt`

Private keys are encrypted at rest with the same AES-256-GCM helper used for TOTP (`TOTP_ENCRYPTION_KEY` or `EPIC_ENCRYPTION_KEY`).

---

## Register an Epic app (sandbox)

1. Go to [fhir.epic.com](https://fhir.epic.com) and sign in.
2. Create an app using **Backend Systems** (client credentials / JWT assertion).
3. Generate an **RSA key pair**; upload the **public** key to Epic; keep the **private PEM** offline.
4. Note the **Non-Production Client ID** and optional **JWK Key ID (kid)**.
5. Request scopes (minimum for this app):
   - `system/Patient.read`
   - `system/Coverage.read`
   - `system/Account.read`
6. Use sandbox defaults (pre-filled in the UI):
   - FHIR base: `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/`
   - Token URL: `https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token`

Epic’s sandbox includes test patients (e.g. search by last name **Mychart**). MRN system OID may differ in production—set **MRN identifier system** on the connection form.

---

## Configure in Credit Balance

1. Sign in as tenant or client admin.
2. **Admin → Clients** → **Epic** for the target facility (or `/admin/clients/:clientId/epic`).
3. Enable Epic sync, paste **client ID** and **private key PEM**, save.
4. **Test connection** — validates OAuth + FHIR metadata.
5. **Search Epic** — preview patients by name, MRN, or birth date.
6. **Preview sync** — dry run (no DB writes).
7. **Apply sync** — upsert accounts; existing financial columns from CSV import are **not overwritten**.

Sync matches existing accounts by `epicPatientFhirId`, then `(clientId, patientId)`.

---

## API reference

All routes require session auth (`Authorization: Bearer …`).

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/epic/defaults` | any authenticated | Sandbox URL defaults |
| GET | `/epic/:clientId/config` | client access | Read connection (no private key) |
| PUT | `/epic/:clientId/config` | admin | Upsert connection |
| POST | `/epic/:clientId/test` | admin | OAuth + metadata test |
| POST | `/epic/:clientId/search` | client access | Search + enrich preview |
| POST | `/epic/:clientId/sync` | client access | `{ mode: "DRY_RUN" \| "APPLY", …search params }` |
| GET | `/epic/:clientId/runs` | client access | Last 20 sync runs |

Search/sync body (all optional except you should supply at least one filter):

```json
{
  "family": "Mychart",
  "given": "Allison",
  "mrn": "203713",
  "birthdate": "1990-01-01",
  "fhirPatientId": "eABCD..."
}
```

---

## Environment variables

In `apps/api/.env`:

```env
TOTP_ENCRYPTION_KEY="long-random-string"
# optional alias for Epic-only deployments:
# EPIC_ENCRYPTION_KEY="long-random-string"
```

Use a strong key in production; without it the API falls back to `JWT_SECRET` (not recommended for PHI environments).

---

## Limitations & roadmap

- No scheduled Epic sync yet (manual or API-triggered only).
- Financial balances remain import-driven until Resolute / proprietary financial APIs are added.
- Production Epic URLs and MRN OIDs must be configured per customer deployment.
- Rate limits and Epic approval workflows apply in production.

---

## Related docs

- [TECH.md](./TECH.md) — full stack reference  
- [USER.md](./USER.md) — operator steps for Epic sync  
- [TEST_CASES.md](./TEST_CASES.md) — TC-EPIC-* cases
