# Test cases catalog — Credit Balance

Living inventory of product test cases.  
**Automated** cases are implemented under `apps/api/tests/` and reference the same **TC-*** IDs.  
Add a row here whenever behavior is defined; implement automated coverage when the logic is pure or the harness exists.

Last reviewed: 2026-08-11

---

## How to use this file

| Column | Meaning |
|--------|---------|
| **ID** | Stable test-case id (`TC-AREA-nnn`) |
| **Area** | Domain (auth, rules, import, …) |
| **Title** | Short name |
| **Type** | `auto` unit · `manual` · `both` · `planned` |
| **Status** | `implemented` · `partial` · `todo` |
| **Notes** | File or steps |

After a feature ships: add/update IDs → set Type/Status → write/extend Vitest when Type includes `auto`. See [TESTING.md](./TESTING.md).

---

## Auth & access

| ID | Title | Type | Status | Notes |
|----|-------|------|--------|-------|
| TC-AUTH-001 | Login with tenant slug + valid credentials | planned | todo | API integration |
| TC-AUTH-002 | Login fails with wrong password | planned | todo | |
| TC-AUTH-003 | Analyst cannot open `/admin/*` routes | planned | todo | web |
| TC-AUTH-004 | Tenant isolation (no other tenant data) | planned | todo | |
| TC-AUTH-010 | TOTP secret encrypt/decrypt | auto | implemented | `totp.test.ts` |
| TC-AUTH-011 | TOTP code verifies | auto | implemented | `totp.test.ts` |
| TC-AUTH-012 | Backup code one-time consume | auto | implemented | `totp.test.ts` |
| TC-AUTH-013 | Login returns requires2fa when enabled | planned | todo | |
| TC-AUTH-014 | Login/2fa accepts TOTP | planned | todo | manual ok |
| TC-AUTH-015 | Profile page enroll + confirm OTP | manual | todo | `/profile` |
| TC-AUTH-016 | Profile update name | planned | todo | |
| TC-AUTH-017 | Profile change password | planned | todo | |

## Rules engine

| ID | Title | Type | Status | Notes |
|----|-------|------|--------|-------|
| TC-RULE-001 | LTE matches zero charges | auto | implemented | `compiler.test.ts` |
| TC-RULE-002 | ABS_EQ_FIELD admin adj vs charges | auto | implemented | `compiler.test.ts` |
| TC-RULE-003 | GT_FIELD EMR > ERA charges | auto | implemented | `compiler.test.ts` |
| TC-RULE-010 | anyPayerCategory IN medicaid | auto | implemented | `compiler.test.ts` |
| TC-RULE-011 | anyPayerCategory misses absent code | auto | implemented | `compiler.test.ts` |
| TC-RULE-012 | payerUnmapped EQ true | auto | implemented | `compiler.test.ts` |
| TC-RULE-013 | primaryPayerCategory case-insensitive EQ | auto | implemented | `compiler.test.ts` |
| TC-RULE-020 | onlyUnclassified skips assigned accounts | auto | implemented | `compiler.test.ts` |
| TC-RULE-021 | Group conditions are AND | auto | implemented | `compiler.test.ts` |
| TC-RULE-022 | Unknown field does not match | auto | implemented | `compiler.test.ts` |
| TC-RULE-030 | Hierarchy first-match-wins across ranks | planned | todo | executor integration |
| TC-RULE-031 | Dry run does not write Account.refundReasonId | planned | todo | |
| TC-RULE-032 | Apply writes reason + change history | planned | todo | |
| TC-RULE-033 | Excluded account maps skipped by run | planned | todo | |

## Payer maps

| ID | Title | Type | Status | Notes |
|----|-------|------|--------|-------|
| TC-PAYER-001 | Primary plan code → category | auto | implemented | `payerMaps.test.ts` |
| TC-PAYER-002 | Unmapped code → payerUnmapped | auto | implemented | `payerMaps.test.ts` |
| TC-PAYER-003 | Resolve by plan name | auto | implemented | `payerMaps.test.ts` |
| TC-PAYER-004 | Category codes deduped on any slot | auto | implemented | `payerMaps.test.ts` |
| TC-PAYER-005 | Empty plan is not “unmapped” | auto | implemented | `payerMaps.test.ts` |
| TC-PAYER-010 | Coverage API counts unmapped primaries | planned | todo | |
| TC-PAYER-011 | Admin can CRUD payer map UI | manual | todo | `/admin/mappings/payers` |

## Field allowlist

| ID | Title | Type | Status | Notes |
|----|-------|------|--------|-------|
| TC-FIELD-001 | Financial fields non-virtual | auto | implemented | `fields.test.ts` |
| TC-FIELD-002 | Payer fields virtual | auto | implemented | `fields.test.ts` |
| TC-FIELD-003 | FIELD_OPTIONS vs keys | auto | implemented | `fields.test.ts` |
| TC-FIELD-004 | Non-allowlisted names rejected | auto | implemented | `fields.test.ts` |

## Import

| ID | Title | Type | Status | Notes |
|----|-------|------|--------|-------|
| TC-IMPORT-001 | CSV headers + rows parse | auto | implemented | `csvImport.test.ts` |
| TC-IMPORT-002 | Quoted commas preserved | auto | implemented | `csvImport.test.ts` |
| TC-IMPORT-003 | toCsv round-trip | auto | implemented | `csvImport.test.ts` |
| TC-IMPORT-010 | Money parse $ / ( ) formats | auto | implemented | `csvImport.test.ts` |
| TC-IMPORT-011 | Missing ids rejected | auto | implemented | `csvImport.test.ts` |
| TC-IMPORT-012 | Derive patientId from accountNumber | auto | implemented | `csvImport.test.ts` |
| TC-IMPORT-030 | Auto-suggest mapping from aliases | auto | implemented | `csvImport.test.ts` |
| TC-IMPORT-031 | User column mapping overrides auto | auto | implemented | `csvImport.test.ts` |
| TC-IMPORT-032 | Analyze CSV returns headers + samples | auto | implemented | `csvImport.test.ts` |
| TC-IMPORT-033 | Import UI mapping requires identity field | manual | todo | Import page |
| TC-IMPORT-020 | Dry run does not insert accounts | planned | todo | API |
| TC-IMPORT-021 | Apply creates then second apply updates | planned | todo | API |
| TC-IMPORT-022 | Import stays within selected client | planned | todo | |

## Queues & workbench

| ID | Title | Type | Status | Notes |
|----|-------|------|--------|-------|
| TC-QUEUE-001 | Queue open counts after apply | planned | todo | manual ok |
| TC-WORK-001 | Add note on account | planned | todo | |
| TC-WORK-002 | Change refund reason | planned | todo | |
| TC-TXN-001 | EHR vs 835 tabs load | planned | todo | manual |
| TC-TXN-002 | Overview flags seeded anomalies | planned | todo | |

## Epic FHIR

| ID | Title | Type | Status | Notes |
|----|-------|------|--------|-------|
| TC-EPIC-001 | extractMrn prefers configured OID | auto | implemented | `epicMappers.test.ts` |
| TC-EPIC-002 | patientName official use | auto | implemented | `epicMappers.test.ts` |
| TC-EPIC-003 | Coverage order → primary/secondary | auto | implemented | `epicMappers.test.ts` |
| TC-EPIC-004 | mapEpicPatientToAccount identity | auto | implemented | `epicMappers.test.ts` |
| TC-EPIC-005 | toPreview UI shape | auto | implemented | `epicMappers.test.ts` |
| TC-EPIC-010 | OAuth token exchange | planned | todo | sandbox credentials |
| TC-EPIC-011 | Test connection metadata | manual | todo | Admin Epic page |
| TC-EPIC-012 | Apply sync preserves financial cols | planned | todo | integration |
| TC-EPIC-013 | Admin Epic config save | manual | todo | `/admin/clients/:id/epic` |

## Admin / UI chrome

| ID | Title | Type | Status | Notes |
|----|-------|------|--------|-------|
| TC-UI-001 | Mapping nav only under Admin | manual | implemented | product change |
| TC-UI-002 | Clients nav not active on client reasons child path | manual | implemented | `end` on NavLink |
| TC-UI-003 | AdminOnly redirects non-admins | planned | todo | |

## Seed / smoke (manual)

| ID | Title | Type | Status | Notes |
|----|-------|------|--------|-------|
| TC-SMOKE-001 | `pnpm db:reset-mock` + login demo admin | manual | todo | full stack |
| TC-SMOKE-002 | Hierarchy dry run returns matches | manual | todo | Main Campus |
| TC-SMOKE-003 | Import template dry run | manual | todo | |

---

## ID ranges (for new cases)

Reserve ranges so IDs stay organized:

| Prefix | Use |
|--------|-----|
| TC-AUTH- | Authentication / JWT |
| TC-RULE- | Rule compiler + hierarchy |
| TC-PAYER- | Payer maps |
| TC-FIELD- | Allowlist |
| TC-IMPORT- | CSV import |
| TC-EPIC- | Epic FHIR sync |
| TC-QUEUE- | Work queues |
| TC-WORK- | Account workbench |
| TC-TXN- | Transactions / anomalies |
| TC-UI- | Front-end chrome / nav / roles |
| TC-SMOKE- | Full-stack smoke |
| TC-RPT- | Reports (future) |
| TC-RBAC- | Analyst reason assignment (future) |
