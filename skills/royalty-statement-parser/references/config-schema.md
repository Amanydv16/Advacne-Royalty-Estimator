# Config Schema

The config is the only thing you write by hand. Everything downstream of it is deterministic.

## Top level

```json
{
  "usd_rates": { "EUR": "1.08", "GBP": "1.28" },
  "period_basis": "usage",
  "sources": [ ... ]
}
```

| Key | Required | Notes |
|---|---|---|
| `usd_rates` | optional (only needed if non-USD currencies exist) | Conversion rate to USD, as strings so they stay exact. `USD: 1` is implicit. |
| `period_basis` | recommended | `"usage"` or `"reporting"`. Recorded in the audit so the output is self-documenting. It does not change behaviour; it documents the choice you made when picking `period_column`. |
| `sources` | yes | One entry per file, or per logical block within a file. |

---

## Source: `mode: "rows"`

For transaction-level exports — CSV, TSV, or a spreadsheet where the sheet is a flat table.

```json
{
  "label": "DistroKid",
  "file": "/abs/path/results.csv",
  "mode": "rows",
  "sheet": "Sheet1",
  "header_row": 1,
  "period_column": "Sale Month",
  "amount_column": "Earnings (USD)",
  "currency": "USD",
  "filters": [{ "column": "Type", "op": "not_equals", "value": "Advance" }]
}
```

| Key | Notes |
|---|---|
| `label` | Appears in the audit. Use the distributor name — it makes duplicate-statement detection readable. |
| `sheet` | Spreadsheets only. Omit for the first sheet. |
| `header_row` | 1-based. Default 1. Raise it when the file has title rows above the header. |
| `period_column` | Name (case-insensitive, unique substring match allowed) or 0-based index. |
| `period` | Use instead of `period_column` when the file has no period column and the period comes from the filename or a header cell. |
| `amount_column` | Same matching rules. |
| `currency` | `"USD"`, or `{"column": "Currency"}` for per-row currency. Omitted means inferred from the column header, with a warning. |
| `filters` | Optional. All must pass for a row to count. |

Encoding, BOM and delimiter are detected automatically; `,` `;` tab and `|` all work.

Blank amount cells are skipped silently — they contribute nothing. Rows whose period or amount cannot be parsed are skipped and listed individually in the audit, never dropped quietly.

### Filter operators
`equals`, `not_equals`, `in`, `not_in`, `contains`, `not_contains`, `non_empty`.

```json
"filters": [
  { "column": "Source Type", "op": "in", "value": ["Song", "Album"] },
  { "column": "Description", "op": "not_contains", "value": "advance" }
]
```

Use filters sparingly and justify each one to the user. Filtering is how a total silently becomes wrong. In particular do not filter out negative rows, void rows or reversals — they are part of the net.

---

## Source: `mode: "cells"`

For summary statements, where the figure lives in one labelled cell.

```json
{
  "label": "Black 17 Media",
  "file": "/abs/path/statement.xlsx",
  "mode": "cells",
  "sheet": "Statement",
  "currency": "USD",
  "entries": [
    { "period": "Sept 2022", "amount_cell": "B16",
      "note": "Current Period Royalties" }
  ]
}
```

The script reads the coordinate out of the file, so nothing depends on you retyping a number correctly. Always prefer this to `literal` for spreadsheets.

`period` accepts any format the parser understands — including the `Sept 2022` form found in a header cell. Put the row label you read in `note`; it lands in the audit and is what makes the choice auditable later.

One workbook may contribute several entries (one per month), and several sources may point at the same file — for example a summary block plus a separate sheet.

---

## Source: `mode: "literal"`

Last resort, for PDFs and scans with no machine-readable value.

```json
{
  "label": "Publisher PDF",
  "file": "/abs/path/statement.pdf",
  "mode": "literal",
  "currency": "GBP",
  "entries": [
    { "period": "2024-03", "amount": "1234.56",
      "note": "Net royalties payable, page 2" }
  ]
}
```

Transcribe the digits exactly as printed, as a string. Record the page and label in `note`. `1,234.56`, `(45.00)` for negatives, and `1.234,56` European decimals are all parsed correctly, so copy the source form rather than reformatting it.

For PDFs, run `inspect_source.py` on the file first — it extracts the text layer and any tables, which is usually enough to locate the figure. If the PDF is a scan with no text layer, say so rather than guessing at digits.

### Per-entry overrides
`currency` may be set on an individual entry, overriding the source default — useful for a statement that pays some periods in one currency and some in another.

---

## CLI

```bash
python3 scripts/parse_royalties.py --config config.json \
    --out royalties_eur.csv --audit audit.md \
    [--decimals 2] [--month-format name]
```

| Flag | Effect |
|---|---|
| `--audit` | Writes the audit to a file as well as stdout. Always use it. |
| `--decimals N` | Rounds the EUR column to N places, half-up. Omit for full precision (default). Source values are never rounded either way — this affects presentation of the converted figure only. |
| `--month-format` | `number` (default, 1–12) or `name` (`April`). |

Exit is non-zero-free by design: warnings go to stderr with a count so they are visible in a transcript, but the CSV is still written so you can inspect what was produced. Read the audit before delivering.
