# Credit Balance documentation

| Document | Audience | Purpose |
|----------|----------|---------|
| [EPIC_INTEGRATION.md](./EPIC_INTEGRATION.md) | Engineers / admins | Epic FHIR connection, sandbox setup, API |
| [TECH.md](./TECH.md) | Engineers | Architecture, stack, modules, APIs, data model, how to extend |
| [USER.md](./USER.md) | Operators / analysts / admins | How to use the application day to day |
| [TEST_CASES.md](./TEST_CASES.md) | QA + engineers | Living inventory of test cases (manual + automated IDs) |
| [TESTING.md](./TESTING.md) | Engineers | How to run automated tests and add new ones |

**When you ship a feature:** update TECH + USER, add/change rows in TEST_CASES, and implement automated tests where practical.

Transaction anomaly detail (rule definitions): [../rules/TRANSACTION_ANOMALIES.md](../rules/TRANSACTION_ANOMALIES.md)

Root setup / ports: [../README.md](../README.md)
