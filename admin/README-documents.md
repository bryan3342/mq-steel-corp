# Documents — invoice & fax generator

A human-gated tool in the admin console (**Documents** in the sidebar) that fills a Word
template with your data and downloads a `.docx`. All math is done in code — the model never
touches numbers.

- **Flow:** pick Invoice or Fax → fill the form → review the live preview → **Generate .docx**.
- **PDF:** open the downloaded `.docx` in Word / Google Docs and *Save as PDF* (perfect fidelity).
- **Invoice numbers:** auto, gap-free, sequential (`MQ-0001`, `MQ-0002`, …) via a Firestore
  counter (`counters/invoice`). Leave the Invoice # blank to auto-assign, or type your own.
- **History:** every generated document is logged (metadata only — no customer body/PII) to the
  immutable `documents` collection.
- **Draft with Flux:** optional button that expands a short note into a professional description.
  It only writes the description text — never prices or totals.

## Replacing the starter templates with your branded ones

The templates live at `admin/assets/templates/invoice.docx` and `admin/assets/templates/fax.docx`.
They're plain starter layouts — **replace them with your real letterhead** and keep the
`{placeholder}` tags where the values should appear. The code fills whatever tags are present.

### Authoring rules (important)
- One bare tag per value. **No math or filters inside a tag** — never `{price*1.08}` or
  `{total | currency}`. All values arrive pre-formatted.
- Type each whole `{tag}` in one go (or paste as plain text). If Word splits a tag across
  formatting runs (bold/italic mid-tag), generation fails with an "unclosed tag" error.

### Invoice tags
`{invoiceNumber}` · `{invoiceDate}` · `{billToName}` · `{billToAddress}` · `{taskName}` ·
`{description}` · `{subtotal}` · `{taxRate}` · `{tax}` · `{total}` · `{notes}`

Line items are a repeating **table row** — put `{#lineItems}` at the start of the row's first
cell and `{/lineItems}` at the end of the last cell, with `{item}` and `{amount}` inside:

| `{#lineItems}{item}` | `{amount}{/lineItems}` |
| --- | --- |

### Fax tags
`{to}` · `{from}` · `{faxNumber}` · `{faxDate}` · `{re}` · `{pages}` · `{message}`

## Tax rate
The tax rate is an editable field on the form (default 0%). Set your standard rate there; it's
applied as `subtotal × rate`, rounded to the nearest cent.

## Under the hood
- Money math: `admin/assets/js/invoice-calc.js` (integer cents; unit-tested in
  `test/invoice-calc.test.mjs`).
- Generator/UI: `admin/assets/js/documents.js`.
- Libraries (vendored, pure-JS, CSP-safe — no eval/WASM): `pizzip@3.1.7` and
  `docxtemplater@3.50.0` under `admin/assets/vendor/`.
