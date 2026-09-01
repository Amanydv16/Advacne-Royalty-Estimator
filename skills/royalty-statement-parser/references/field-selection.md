# Choosing the net royalty field

## Contents
1. [The target concept](#the-target-concept)
2. [Decoy columns](#decoy-columns)
3. [Double-counting traps](#double-counting-traps)
4. [Reconciling your choice](#reconciling-your-choice)
5. [Period fields](#period-fields)
6. [Currency detection](#currency-detection)
7. [Known layouts](#known-layouts)

---

## The target concept

You want the money the artist actually earned for that period — after the distributor's or label's share, after the contractual split, before nothing else.

In a transaction-level export this is the per-line earnings column, already net of the platform and distributor cut. In a summary statement it is the period's royalty total.

Naming varies: `Earnings`, `Royalty`, `Net Royalty`, `Royalty Earned`, `Artist Net`, `Payable`, `Net Revenue Royalties`, `Total Due`, `Share`. Do not match on name alone — confirm with the exact sums the inspector prints.

---

## Decoy columns

Every one of these has been mistaken for net royalty. All appear alongside it.

| Column | Why it's wrong |
|---|---|
| `Gross Revenue`, `Retail`, `Net Sales`, `Consumer Price` | Revenue before the artist's share. Typically ~2x the real figure at a 50% rate. |
| `Songwriter Royalties Withheld`, `Mechanicals Withheld` | Money deducted and paid elsewhere. Often sums to exactly 0.00, which is a giveaway. |
| `Tax`, `Withholding`, `VAT`, `Sales Tax` | Deductions, not earnings. |
| `Fees`, `Distribution Fee`, `Admin Fee`, `Commission` | The distributor's cut. |
| `Recoup`, `Recoupment`, `Advance`, `Offset` | Money applied against an advance, not earned this period. Often empty. |
| `Previous Period Balance`, `Opening Balance` | Carried forward from earlier statements. Including it double counts an earlier month. |
| `Ending Balance`, `Closing Balance` | Cumulative account state, not period earnings. |
| `Amount Payable`, `Amount Due` | Period earnings plus any carry-forward, minus minimum-payment holdbacks. Safe only when it equals the period royalty figure. |
| `Minimum Payment`, `Payment Threshold` | A policy constant. |
| `Rate`, `Effective Rate`, `Team Percentage`, `Share %` | A multiplier, not an amount. Usually 0–1 or 0–100. |
| `Count`, `Quantity`, `Units`, `Streams` | Volume. Large integers — easy to spot in the profile. |

**Balances vs earnings** is the trap that matters most for month-wise output. `Amount Payable` may include a balance rolled over from a prior period; if you use it, that prior period's money is counted twice across the series. Prefer the figure describing this period's royalties. When the two differ, use the period figure and tell the user the statement carries a balance.

**Negative amounts are usually legitimate.** Reversals, chargebacks, void or refund rows, and FX corrections are part of the net. Include them. Do not filter out negatives to make a total look tidier — that inflates the result. Only exclude a row when it represents a genuinely different concept (an advance line, a recoupment line) and say that you did.

---

## Double-counting traps
1. **Subtotal and total rows inside a data range.** Summary spreadsheets often interleave `Album Total:`, `Net Revenue Total:`, `Total:` rows with detail rows. Parsing that range in `rows` mode sums detail and subtotals, roughly doubling the result. Use `cells` mode against the summary figure instead, or filter the subtotal rows out.
2. **Summary and detail in the same workbook.** Take one or the other, never both.
3. **Overlapping statements.** Two files from the same distributor covering the same period — a monthly statement and a year-to-date export, or a re-issued correction. Check the per-source table in the audit for the same distributor appearing twice in one month.
4. **Composition and recording rows.** These are separate income streams for the same stream and both belong in the total. Not a duplicate.

---

## Reconciling your choice

Before running the parser, satisfy yourself that the number is right:
1. Does the column's exact sum match a total the document states about itself? Summary statements state their own; if a row-level sum disagrees, one of them is wrong and it is usually the row-level parse.
2. Is it roughly the expected fraction of the gross column? A 50% deal should put net at about half of net sales. If your "net" equals gross, you picked the gross column.
3. Is the magnitude plausible for the stream counts?

If the file name or an accompanying note carries an expected figure, check against it — that is the strongest confirmation available.

---

## Period fields

- **Candidate names for the usage basis (preferred):** `Sale Month`, `Activity Period`, `Usage Period`, `Sales Period`, `Period`, `Transaction Month`, `Service Month`, `Accounting Period`.
- **Candidate names for the reporting basis:** `Reporting Period`, `Reporting Date`, `Statement Period`, `Payment Date`, `Paid On`, `Date Inserted`.

`Date Inserted` and similar ingestion timestamps are never the economic period — they record when the distributor loaded the data.

If a statement has only one date field, use it and say which kind it is. If a summary statement states its period only in a header cell or the filename (`Sept 2022`), pass it as the entry's `period` value.

Formats the parser accepts: `2026-04`, `2026/04/15`, `04/2026`, `202604`, `April 2026`, `APR-26`, `Sep-2022`, `2026-Apr`, real date/datetime cells, and prose containing a month and year. Two-digit years map `00–69` to 2000s, `70–99` to 1900s. Ambiguous `05/04/2026`-style dates are rejected rather than guessed.

Quarterly, half-year and annual buckets are rejected on purpose. Splitting `Q2 2025` into three months means inventing two figures. Ask the user whether to attribute the whole amount to one month, or leave the file out.

---

## Currency detection

Order of preference:
1. An explicit per-row currency column — map with `{"column": "Currency"}`.
2. A currency stated in the column header: `Royalty ($US)`, `Earnings (USD)`, `Net (EUR)`. The parser infers from the header and warns; confirm it.
3. A currency label near the total: `746.72 (USD)` in an adjacent cell.
4. The statement's country or the distributor's home market — weak evidence. Ask rather than assume.

`$` alone is ambiguous across USD, CAD, AUD, NZD. `$US` and `US$` are USD.

Rates go in `eur_rates` as units per 1 EUR, as strings. `"EUR to USD is 1.17"` means `{"USD": "1.17"}`. A currency with no rate produces a null amount and a warning — that is correct behaviour, not a failure to fix by guessing a rate.

---

## Known layouts

### DistroKid-style transaction export (`results.csv`)
- One row per track / store / territory / month.
- **Net royalty**: `Earnings (USD)` — already net of the team split.
- **Period**: `Sale Month` (usage basis), format `2026-04`.
- **Currency**: USD, from the header.
- **Ignore**: `Songwriter Royalties Withheld (USD)` (a deduction, typically 0.00), `Recoup (USD)` (usually empty), `Team Percentage` (a rate, not money), `Reporting Date` and `Date Inserted` (ingestion dates).
- Contains legitimate negative rows; keep them.

### Label summary statement, Excel (`black_17_media_*.xlsx`)
- A `Statement` sheet with a summary block at the top, an "Uncrossed Totals" table, then per-album detail sections. Period appears as a header cell such as `Sept 2022`.
- **Net royalty**: the `Current Period Royalties:` cell (`cells` mode, e.g. `B16`). `Amount Payable:` is fine when it matches; here both are 746.72 because the prior balance of 373.11 was paid out and reversed on the line below it.
- **Never take Previous Period Balance (373.11)** — earlier money.
- **Never parse the album detail rows in rows mode**: the section contains both Net Sales (gross, ~2x) and Total (net at 50%), plus `Net Revenue Total:` and `Album Total:` subtotal rows.
- **Cross-check**: the per-album Total column sums to the payable figure.
- A `Legend` sheet decodes source codes (`DS` = digital stream, `DT` = download, `PI` = performance income). All are income; none should be excluded.

### Label/aggregator earnings report (`EarningsReport_*.csv`)
- UTF-8 with BOM. One row per track / DSP / territory / activity month.
- **Net royalty**: `Royalty ($US)`.
- **Period**: `Activity Period` (usage basis, e.g. `April 2026`) — not `Reporting Period`. A single `APR-26` reporting period here spans six activity months from December 2025 to May 2026, so the choice materially changes the output.
- **Currency**: USD, from the `($US)` header.
- **Sale or Void**: Void rows carry negative royalties and are reversals of earlier sales. Include them — the net is the sum of both. Filtering them out overstates earnings.
