# User guide — Credit Balance

How to use Credit Balance in daily workflows. **Update this guide when screens, roles, or workflows change.**

Last reviewed: 2026-08-11

---

## 1. What this app does

Credit Balance helps a health system **find why** patient accounts have credit balances, **sort them into reason queues**, and **work them** with notes and transaction review—without writing SQL.

Core flow:

1. **Admin** maps payers and (optionally) account exclusions for a facility (client).
2. **Admin / power user** builds a **rule hierarchy** (ordered if/then refund reasons).
3. Someone runs **Dry run** then **Apply hierarchy** (or a schedule runs overnight).
4. **Analysts** open **Work queues**, work accounts, review **EHR vs 835** transactions, add notes.

## 2. Sign in

1. Open the web app (local default: http://localhost:5173).
2. Enter **tenant slug**, **email**, and **password**.
3. If two-factor authentication (OTP) is enabled for your account, enter the **6-digit authenticator code** (or a **backup code**).

Demo (synthetic data only):

| Tenant | Email | Password | Role |
|--------|--------|----------|------|
| `demo` | `admin@demo.local` | `password123` | Tenant admin |
| `demo` | `analyst@demo.local` | `password123` | Analyst |
| `demo` | `clientadmin@demo.local` | `password123` | Client admin |
| `northstar` | `admin@northstar.local` | `password123` | Other tenant |

Demo users start **without** OTP. Enable it under **Security**.

Use the **Client** selector in the sidebar to switch facilities when your role allows more than one.

## 3. Roles (what you see)

| Role | Typical access |
|------|----------------|
| **Analyst** | Queues, accounts, workbench, transactions, hierarchy (view/run depending policy) |
| **Client admin** | Above + Admin: client reasons, payer maps, account maps for assigned clients |
| **Tenant admin** | All clients in the tenant + Users + Clients admin |

**Payer maps** and **Account maps** are under **Admin** (not general client menu).

## 4. Dashboard

Shows counts for the selected client: unclassified accounts, queued work, rule packs, and **unmapped primary payers**. Use **Fix maps** to open payer mapping.

## 5. Work queues

- Each enabled refund reason can have a queue.
- Open a queue to see accounts with that reason and start working.
- Prefer working from queues so everyone pulls from the same backlog.

## 6. Accounts list & workbench

- **Accounts** lists the selected client’s accounts (filters for unclassified, etc.).
- Open an account → **Workbench**:
  - See balances and current refund reason / status.
  - Change reason or status when policy allows.
  - Add **notes**.
  - Mark complete / go to next when available.
- **Transactions** (full-screen): focused EHR / 835 / Overview review—mark issue rows and attach context to a note.

### Transaction tabs

- **EHR** — host system transactions.
- **835** — remittance (ERA) transactions.
- **Overview** — highlights anomalies (e.g. imbalances between sources). Treat as guidance; always confirm before writing off or refunding.

## 7. Rules engine

### Hierarchy (`Hierarchy`)

- Rules run **top to bottom**.
- **First matching rule assigns the refund reason** and stops for that account.
- Prefer conditions that run only on **unclassified** accounts so re-runs do not reclass work already done unless you clear reasons.

**Dry run** — see matches (including mapped payer category when available).  
**Apply hierarchy** — write refund reasons and history.

### New rule

1. Name the rule and choose hierarchy rank (1 = highest priority).
2. Choose the **refund reason** to assign on match.
3. Add conditions (all must match).
4. For payer types, prefer **mapped** fields:
   - *Any payer category* with operator **IN** and codes like `medicaid`, `medicare`
   - *Primary plan unmapped* = true for “needs mapping” buckets  
   Avoid hard-coding raw plan codes unless intentionally client-specific.
5. Save; reorder on the hierarchy page if needed.

### Schedules

Optional cron (e.g. nightly apply). Enable only after dry-run results look safe.

## 8. Import (CSV)

**Import** in the main menu:

1. Upload a file or paste CSV text (or load the template).
2. The app **detects columns** and opens the **column mapping** panel.
3. For each system field, choose the spreadsheet column (or skip).  
   - **Auto-match names** uses common header aliases (PatientID, Charges, Balance, …).  
   - You can reassign any field; sample values from the first row help confirm the pick.
4. Map at least **Patient ID** or **Account number** (identity).
5. **Preview (dry run)** — creates vs updates, no write (uses your mapping).
6. **Apply import** — upsert into the selected client with that mapping.
7. Review **Import history**.

**Practice file:** `samples/sample-account-import.csv` (see `samples/README.md`) uses non-standard export headers so you can exercise the mapper. Upload it from the Import page.

Unmapped source columns are listed so nothing is forgotten. Matching existing accounts uses patient id (preferred), then account number, **within that client only**.

## 8a. Profile & security (OTP)

Open **Profile** (sidebar, or “Account & security” under sign out):

1. **Account** — update first/last name (email and role are read-only).
2. **Change password** — current password + new password (min 8 characters).
3. **Two-factor authentication** — set up or disable authenticator OTP, regenerate backup codes.
   - Scan the QR code (or enter the secret) in Microsoft Authenticator, Google Authenticator, 1Password, etc.
   - Confirm with a **6-digit code**. Save **backup codes** when shown.
   - Next sign-in: password, then OTP (or a backup code).
   - To change authenticator later: disable OTP (password + code), then set up again.

OTP is optional per user today (demo accounts start with it off). Admins should enable it. `/security` redirects to Profile.

## 9. Admin

### Clients / Users (tenant admin)

- Create and maintain facilities and users.
- Assign users to clients as needed.

### Client reasons

Enable which **refund reasons** this client can use for rules and queues.

### Payer maps

Map source **plan codes / names** (from the host system) to tenant **payer categories** (Medicaid, Medicare, Commercial, …).

- Coverage stats show mapped vs unmapped primary plans.
- Unmapped sample accounts help you finish mapping before relying on category-based rules.

### Epic FHIR (optional)

For facilities on Epic, connect via **Admin → Clients → Epic**:

1. Register a **Backend Systems** app at [fhir.epic.com](https://fhir.epic.com) (sandbox or production).
2. Paste **client ID** and **RSA private key** on the Epic page; enable sync and save.
3. **Test connection**, then search by patient name or MRN.
4. **Preview sync** (dry run) or **Apply sync** to create/update accounts with demographics and insurance.

Epic provides patient and coverage data; **dollar balances** still come from CSV import unless you add a financial feed later. See **docs/EPIC_INTEGRATION.md** for sandbox patients and scopes.

### Account maps

Tag or **exclude** accounts (or keys) so the hierarchy skips them where applicable.

## 10. Recommended operating sequence (new client)

1. Create/select client and assign users.
2. Enable refund reasons.
3. Import or seed account extract (CSV and/or Epic sync).
4. Build **payer maps** until unmapped count is acceptable.
5. Build/order hierarchy (use mapped categories where possible).
6. Dry run → spot-check sample accounts → Apply.
7. Analysts work queues; use transaction view for hard cases.
8. Keep maps and rules updated as new plan codes appear.

## 11. Good habits

- Never paste production PHI into public tickets or source control.
- Prefer dry run after any rule reorder or new rule.
- After large imports, re-check payer map coverage.
- Document local process overrides in your SOPs; this guide describes the product itself.

## 12. Getting help / environment

- Local stack and ports: project **README**.
- For engineers: **docs/TECH.md**.
- For QA scripts: **docs/TEST_CASES.md**.
