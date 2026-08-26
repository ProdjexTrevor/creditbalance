# Sample import files

## `sample-account-import.csv`

Practice file for the **Import → Column mapping** UI.

Headers look like a typical host/export spreadsheet (not app field names), so some match automatically and some you map yourself.

| Spreadsheet column | Suggested system field | Auto-match? |
|--------------------|------------------------|-------------|
| Host Patient Key | Patient ID | No — map manually |
| Facility Acct # | Account number | No — map manually |
| Pt First Name | First name | No — map manually |
| Pt Last Name | Last name | No — map manually |
| Campus | Location / facility | No |
| IP/OP | Patient type | No |
| Prim Plan Name | Primary insurance name | No |
| Prim Plan Code | Primary plan code | No |
| Sec Plan Name | Secondary insurance name | No |
| Sec Plan Code | Secondary plan code | No |
| Total $ Charges | Total billed charges | No |
| Credit Balance Amt | Patient / credit balance | No |
| Patient Cash Applied | Patient payments (net PGP) | No |
| Admin Adj Amt | Admin / other adjustments | No |
| Contractual Adj Amt | Contractual adjustments | No |
| ERA Charge Total | ERA / 835 charges | No |
| Charity WO Amt | Charity write-off | No |
| Extra Source Note | (skip) | — |

Numbers use common export styles: parentheses for negatives, thousands commas.

### How to try it

1. Sign in, pick a client.
2. Open **Import**.
3. Choose this file (or paste its contents).
4. In **Column mapping**, assign the fields above (use sample values to confirm).
5. **Preview (dry run)** then **Apply import**.

After import, accounts appear under **Accounts** / work queues for that client.
