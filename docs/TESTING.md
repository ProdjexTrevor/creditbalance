# Testing guide — Credit Balance

How automated tests are organized and how to **add** cases as the app grows.

Last reviewed: 2026-08-11

---

## Commands

From repo root:

```bash
pnpm test              # run API unit tests once
pnpm test:watch        # re-run on change
pnpm --filter api test
```

Unit tests do **not** require Docker/MariaDB. They exercise pure logic (compiler, payer enrichment, CSV mapping).

## Layout

```
apps/api/
  vitest.config.ts
  tests/
    helpers.ts           # cond(), rule(), mapRow() fixtures — extend here
    compiler.test.ts     # TC-RULE-*
    payerMaps.test.ts    # TC-PAYER-*
    fields.test.ts       # TC-FIELD-*
    csvImport.test.ts    # TC-IMPORT-*
```

Catalog of all known cases (manual + auto): [`TEST_CASES.md`](./TEST_CASES.md).

## Adding a test case (checklist)

1. **Define behavior** in product/tech docs if needed (USER / TECH).
2. **Register** a row in `docs/TEST_CASES.md` with a new **TC-…** id (pick free number in the area’s range).
3. **Implement** with Vitest when logic is isolated:
   - Prefer `apps/api/tests/<area>.test.ts`.
   - Name the `it(...)` string with the id: `it("TC-RULE-030: first match wins", ...)`.
   - Reuse `helpers.ts` fixtures; add helpers rather than copy-paste accounts.
4. Set the catalog row to `Type: auto`, `Status: implemented`, and the file name under Notes.
5. Run `pnpm test` and fix failures.

For endpoints that need a database, mark as `planned` until we add a test DB harness; still document the case in `TEST_CASES.md` so QA can run it **manual**.

## Conventions

- **No production PHI** in fixtures—synthetic codes and amounts only.
- Keep unit tests fast and deterministic (no network, no `Date.now()` dependency unless mocked).
- When a bug is fixed, add a regression case with a short note in the catalog (e.g. “regression: double-active NavLink”).

## Future layers (planned)

| Layer | Tooling idea | When |
|-------|----------------|------|
| API integration | Vitest + test MariaDB or Prisma transaction rollback | Auth, hierarchy apply, import APPLY |
| Web components | Vitest + React Testing Library in `apps/web` | Nav roles, rule form |
| E2E | Playwright | Full dry-run → queue work smoke |

When those land, update this file and point `TEST_CASES.md` Status rows from `planned` → `implemented`.
