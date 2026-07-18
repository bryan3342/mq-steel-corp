import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmountToCents, parseRatePercent, computeInvoice, formatUSD, DEFAULT_TAX_PERCENT,
} from '../admin/assets/js/invoice-calc.js';

test('parseAmountToCents handles currency formatting and junk', () => {
  assert.equal(parseAmountToCents('1,234.56'), 123456);
  assert.equal(parseAmountToCents('$99'), 9900);
  assert.equal(parseAmountToCents(' 42 '), 4200);
  assert.equal(parseAmountToCents('10.005'), 1001);   // 1000.5 → round half up
  assert.equal(parseAmountToCents('10.004'), 1000);
  assert.equal(parseAmountToCents(''), 0);
  assert.equal(parseAmountToCents('abc'), 0);
  assert.equal(parseAmountToCents('-5'), 500);         // sign stripped → treated as 5.00
  assert.equal(parseAmountToCents(null), 0);
  assert.equal(parseAmountToCents(99.5), 9950);        // number input allowed
});

test('parseRatePercent tolerates a percent sign and rejects junk', () => {
  assert.equal(parseRatePercent('8.875'), 8.875);
  assert.equal(parseRatePercent('8.875%'), 8.875);
  assert.equal(parseRatePercent('0'), 0);
  assert.equal(parseRatePercent(''), 0);
  assert.equal(parseRatePercent('abc'), 0);
  assert.equal(parseRatePercent('-3'), 0);             // negative → 0
});

test('computeInvoice sums line items and rounds tax to the nearest cent', () => {
  const r = computeInvoice({
    lineItems: [{ description: 'Fabrication', amountCents: 2500 }, { description: 'Welding', amountCents: 7500 }],
    taxRatePercent: 8.875,
  });
  assert.equal(r.subtotalCents, 10000);
  assert.equal(r.taxCents, 888);      // 10000 * 8.875% = 887.5 → 888 (half up)
  assert.equal(r.totalCents, 10888);
});

test('computeInvoice: no tax when rate is 0 or missing', () => {
  assert.deepEqual(
    computeInvoice({ lineItems: [{ amountCents: 5000 }], taxRatePercent: 0 }),
    { subtotalCents: 5000, taxCents: 0, totalCents: 5000 },
  );
  assert.deepEqual(
    computeInvoice({ lineItems: [{ amountCents: 5000 }] }),   // default rate
    { subtotalCents: 5000, taxCents: 0, totalCents: 5000 },
  );
  assert.equal(DEFAULT_TAX_PERCENT, 0);
});

test('computeInvoice: empty / malformed inputs are safe', () => {
  assert.deepEqual(computeInvoice({}), { subtotalCents: 0, taxCents: 0, totalCents: 0 });
  assert.deepEqual(computeInvoice(), { subtotalCents: 0, taxCents: 0, totalCents: 0 });
  // items with non-numeric amounts are ignored, valid ones still counted
  assert.equal(
    computeInvoice({ lineItems: [{ amountCents: NaN }, { amountCents: 3000 }, {}] }).subtotalCents,
    3000,
  );
});

test('computeInvoice is deterministic (same inputs → identical outputs)', () => {
  const input = { lineItems: [{ amountCents: 12345 }, { amountCents: 6789 }], taxRatePercent: 7.25 };
  assert.deepEqual(computeInvoice(input), computeInvoice(input));
});

test('formatUSD formats integer cents as currency', () => {
  assert.equal(formatUSD(123456), '$1,234.56');
  assert.equal(formatUSD(0), '$0.00');
  assert.equal(formatUSD(9900), '$99.00');
  assert.equal(formatUSD(5), '$0.05');
  assert.equal(formatUSD(NaN), '$0.00');
});
