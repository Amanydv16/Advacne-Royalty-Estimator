---
name: royalty-statement-parser
description: Turn one or more mapped music royalty statements (CSV, XLSX, PDF) into a single normalized month/year/amount CSV in USD ($) with an audit trail, using exact Decimal arithmetic.
user-invocable: true
---

# Royalty Statement Parser

Royalty statements have no shared standard. Every distributor, label and publisher invents its own layout: transaction-level exports with one row per territory per track, single-page summary statements with the payable figure in a labelled cell, multi-sheet workbooks, PDFs. Column names for the same concept differ wildly, and most statements contain several plausible-looking money columns of which only one is the artist's actual net.

The parsing itself is easy. Picking the right field is the hard part, and it is the part that is silently wrong if rushed. This skill splits those concerns: you decide what each field means, a script does all the arithmetic.

## The four rules that govern every decision

These are not stylistic preferences. Violating any of them produces a file that looks correct and is not.

1. **Every amount ends up in USD ($).** Source amounts in USD are preserved directly without conversion. For non-USD currencies, convert using rates the user supplied or that are stated in the document. Never invent a rate for a currency you weren't given one for.
2. **Preserve source values exactly.** Read 0.500241872758 as 0.500241872758, not 0.50. Never round, truncate, floor or ceiling on the way in, and never use floating-point arithmetic to total money. The script uses Decimal throughout for this reason.
3. **Never confuse revenue types.** You want the artist's net royalty earned — not gross revenue, not net sales, not withholding, not tax, not recoupment, not an account balance. See `references/field-selection.md`.
4. **Never fabricate a month.** If a month does not appear in any source document, it does not appear in the output. Not as a zero, not interpolated. A month present but unconvertible gets an empty (null) amount, never a guess.

## Workflow

### 1. Inspect before deciding anything

Never open a statement with cat or load it into context wholesale — transaction exports run to thousands of rows and you will burn context without gaining clarity. Run the inspector instead:

```bash
python3 scripts/inspect_source.py <file> [<file> ...]
```

It prints, per file: detected encoding and delimiter, the header, and a profile of every column including its exact unrounded sum. For summary-style spreadsheets it dumps every non-empty cell with its coordinate.

Those exact sums are the fastest way to tell candidate money columns apart. A withholding column that sums to zero, a recoup column that is entirely empty, and an earnings column that sums to something close to the statement's stated total identify themselves immediately.

### 2. Choose the net royalty field, and prove the choice

For each file decide two things: which field holds the artist's net royalty and which field holds the period.

Then reconcile: does your chosen column's exact sum match a total the document states about itself? Transaction exports usually have no stated total, in which case check that the figure is plausible against the summary page if one was supplied. Summary statements always state their own total, so a row-level sum that disagrees with it means you picked the wrong column or you are double counting a subtotal row.

Read `references/field-selection.md` before choosing. It covers the decoy columns that most often get picked by mistake and the layouts of the distributors already seen.

### 3. Pick the period basis, and say which you picked

Statements carry two different dates and they routinely disagree:

- **Usage / sales / activity period** — when the streams or sales happened.
- **Reporting / payout period** — when the distributor paid it out.

One reporting period commonly contains six or more activity months of back-catalogue trickle. Grouping by the wrong one moves large sums between months.

Default to the usage period, because it is the month the money was actually earned and it is the basis that stays consistent when statements from different distributors are combined. Switch to reporting basis only if the user asks for a cash-flow view. Either way, state in your reply which basis you used, and do not mix bases across files in one output.

### 4. Write the config

Build a JSON config describing the mapping you settled on. Full annotated schema in `references/config-schema.md`; the short version:

```json
{
  "usd_rates": { "EUR": "1.08", "GBP": "1.28" },
  "period_basis": "usage",
  "sources": [
    {
      "label": "DistroKid",
      "file": "/path/results.csv",
      "mode": "rows",
      "period_column": "Sale Month",
      "amount_column": "Earnings (USD)",
      "currency": "USD"
    },
    {
      "label": "Black 17 Media",
      "file": "/path/statement.xlsx",
      "mode": "cells",
      "sheet": "Statement",
      "currency": "USD",
      "entries": [
        { "period": "Sept 2022", "amount_cell": "B16",
          "note": "Current Period Royalties" }
      ]
    }
  ]
}
```

`usd_rates` are units of that currency per 1 USD (or conversion rate to USD). If the statement is in USD, no conversion is needed. Pass rates as strings so they stay exact.

Three modes:

| Mode | Use for | How the amount is obtained |
|---|---|---|
| `rows` | transaction/line-item exports | summed from a column, one item per row |
| `cells` | summary statements | read from a cell coordinate you name |
| `literal` | PDFs and scans only | a figure you transcribe by hand |

Prefer `cells` over `literal` for anything spreadsheet-shaped. A coordinate makes the script read the number out of the file, which removes any chance of a transcription slip. Reserve `literal` for documents with no machine-readable value, and record where the figure came from in `note`.

### 5. Run it

```bash
python3 scripts/parse_royalties.py --config config.json \
    --out royalties_usd.csv --audit audit.md
```

Options: `--decimals N` rounds the USD column for presentation (omit for full precision, which is the default), `--month-format name` writes `April` instead of `4`.

### 6. Read the audit before you hand anything over

The script prints an audit containing per-source per-month subtotals in the source currency, the monthly output, a conversion check, a list of calendar gaps it deliberately left empty, and any warnings or skipped rows.

Warnings are not noise. Common ones and what they mean:

- **Skipped row: period covers more than one month** — a quarterly or annual bucket. The script refuses to split it because monthly figures would have to be invented. Ask the user how they want it handled.
- **No USD rate supplied for X** — that month is null, by design. Get the rate.
- **Month contains amounts in X with no rate** — the month mixes currencies and is written null rather than as a partial total that would look valid but understate.
- **Unrecognised period** — a format the parser doesn't know. Check whether the column you chose is really the period column.

If a whole source failed, the audit says so and the CSV is quietly missing a statement. Never deliver without reading this.

## Output contract

Exactly three columns, sorted oldest first:

```csv
month,year,amount
9,2022,638.2222222222222222222222222222222
4,2026,391.702831119411965811965811965812
```

- `month` — 1–12 by default
- `year` — four digits
- `amount` — USD ($), full precision by default, empty when null

Multiple statements covering the same month are summed into one row. When handing over the file, mention that `--decimals 2` is available if the user prefers a presentation-rounded version.

## What to tell the user

Give them the CSV, then briefly: which field you took as the net royalty in each statement and why, which period basis you used, the rate applied, and anything the audit flagged. If you had to make a judgement call — a summary statement where "amount payable" and "current period royalties" differ, an ambiguous column, a quarterly bucket — surface it rather than burying it. A royalty figure that is quietly wrong is worse than one the user was asked about.

## Reference files
- `references/field-selection.md` — identifying the net royalty; decoy columns; layouts of distributors already encountered. Read before choosing columns.
- `references/config-schema.md` — every config key, filters, multi-currency columns, multi-sheet workbooks, PDFs.
