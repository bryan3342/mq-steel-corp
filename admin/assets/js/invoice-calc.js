// Pure, dependency-free invoice math. Deterministic → unit-testable (see
// test/invoice-calc.test.mjs). Imported by both the browser (documents.js) and
// the Node tests, exactly like redact.js.
//
// MONEY RULE: line-item amounts are kept as integer CENTS so summation can never
// drift. Tax is a SINGLE rounded multiply by a percentage — float-safe here
// because we round to the nearest cent immediately (there is no float
// accumulation, which is the only thing that actually drifts).

// Owner's default sales-tax rate as a percentage (e.g. 8.875). 0 = no tax until
// the owner sets a real rate; it is also editable per-document in the form.
export const DEFAULT_TAX_PERCENT = 0;

// Parse a user-typed amount ("$1,234.56", "1234.5", " 99 ") to integer cents.
// Non-numeric / empty / negative input → 0 (callers treat 0 as "unset").
export function parseAmountToCents(str) {
  if (str == null) return 0;
  const cleaned = String(str).replace(/[^0-9.]/g, ''); // drop $ , spaces, signs, letters
  if (cleaned === '' || cleaned === '.') return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

// Parse a percentage string ("8.875" or "8.875%") to a number. Invalid → 0.
export function parseRatePercent(str) {
  if (str == null) return 0;
  const cleaned = String(str).replace(/[^0-9.-]/g, ''); // keep '-' so a negative rate is caught below
  const pct = Number(cleaned);
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return pct;
}

// Compute invoice totals. lineItems: [{ description, amountCents }].
// Returns integer-cent fields; taxRatePercent is a number (percent).
export function computeInvoice({ lineItems = [], taxRatePercent = DEFAULT_TAX_PERCENT } = {}) {
  const subtotalCents = (Array.isArray(lineItems) ? lineItems : []).reduce(
    (sum, it) => sum + (Number.isFinite(it?.amountCents) ? Math.max(0, Math.round(it.amountCents)) : 0),
    0,
  );
  const rate = Number.isFinite(taxRatePercent) && taxRatePercent > 0 ? taxRatePercent : 0;
  const taxCents = Math.round((subtotalCents * rate) / 100);
  const totalCents = subtotalCents + taxCents;
  return { subtotalCents, taxCents, totalCents };
}

// Format integer cents as USD, e.g. 123456 → "$1,234.56".
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export function formatUSD(cents) {
  const n = Number.isFinite(cents) ? cents : 0;
  return USD.format(n / 100);
}
