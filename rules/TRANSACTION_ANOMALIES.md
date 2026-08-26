# Transaction anomaly rules

Source of truth for rule **logic**:  
`apps/web/src/rules/transactionAnomalies.ts` → `TRANSACTION_ANOMALY_RULES`

Update that file when we add new detection patterns. Keep this doc in sync with ids/names.

## Tabs

| Tab | Content |
|-----|---------|
| **EHR Transactions** | Host/billing system posts (`source = EHR`) |
| **835 Transactions** | ERA remittance posts (`source = ERA_835`) |
| **Transaction Overview** | Combined ledger + anomaly highlights |

## Active rules (v1)

| ID | Severity | Meaning |
|----|----------|---------|
| `running_total_negative` | **error** (red) | Chronological running balance &lt; 0 after this row |
| `payment_without_charge` | **error** (red) | Payment present but no charge on the account |
| `adjustment_without_credit` | **error** (red) | Adjustment with no payment/credit on the account |
| `adjustment_exceeds_charges` | warning (amber) | \|adj\| &gt; sum of charges |
| `payment_exceeds_charges` | warning (amber) | \|payment\| &gt; sum of charges |
| `zero_amount` | info | Posted amount is 0 |
| `835_cas_without_payment` | warning | 835 CAS code without an 835 payment |

## Conventions

- Ledger signs: **charges / debits often positive**; **payments & many adjustments negative**
- Overview and tab evaluators share the same rule set filter via `appliesTo`
- Disabled rules: set `enabled: false` on the definition (do not delete — comment history)

## Planned / TODO

- [ ] Duplicate insurance payment same day / same plan without reversal  
- [ ] Patient payment on full Medicaid primary without secondary logic  
- [ ] EHR charge vs 835 charge mismatch per claim control number  
- [ ] Transfer without counterpart  
- [ ] Self-pay payment exceeding patient responsibility from 835  
- [ ] Posting date out of order vs admit/discharge  

## How to add a rule

1. Append entry to `TRANSACTION_ANOMALY_RULES` in the TS file  
2. Implement `check(ctx)` returning `string | null`  
3. Add a row to the table above  
4. If it needs new fields, extend `Transaction` in Prisma + seed samples  
