import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact, scrubText } from '../admin/assets/js/redact.js';

test('drops name and email fields', () => {
  const r = redact({ name: 'Jane Doe', email: 'jane@x.com', company: 'Ironworks LLC',
    service: 'Need steel', status: 'new' });
  assert.equal(r.name, undefined);
  assert.equal(r.email, undefined);
  assert.equal(r.company, 'Ironworks LLC');   // company kept
  assert.equal(r.status, 'new');
});

test('scrubs inline email and phone from free text', () => {
  const s = scrubText('Call me at 212-555-0199 or bob@acme.com about the beams.');
  assert.ok(!s.includes('212-555-0199'));
  assert.ok(!s.includes('bob@acme.com'));
  assert.ok(s.includes('beams'));
});

test('service text is scrubbed but preserved', () => {
  const r = redact({ name: 'X', email: 'x@y.com', service: 'Email me x@y.com re: stairs' });
  assert.ok(r.service.includes('stairs'));
  assert.ok(!r.service.includes('x@y.com'));
});

test('redacts every realistic phone format', () => {
  const cases = [
    '(212) 555-0199',
    '212-555-0199',
    '212.555.0199',
    '212 555 0199',
    '+1 212 555 0199',
    '555-0199',
    '2125550199',
  ];
  for (const raw of cases) {
    const s = scrubText(`Call me at ${raw} about the beams.`);
    assert.ok(!s.includes(raw), `expected "${raw}" to be redacted`);
    assert.ok(s.includes('[phone removed]'), `expected marker for "${raw}"`);
    assert.ok(s.includes('beams'), `expected ordinary text preserved for "${raw}"`);
  }
});

test('redacts email with a space before the @', () => {
  const s = scrubText('Reach me at bob @acme.com about the stairs.');
  assert.ok(!s.includes('bob @acme.com'));
  assert.ok(s.includes('[email removed]'));
  assert.ok(s.includes('stairs'));
});

test('redact(null) returns the same shape as redact({})', () => {
  const r = redact(null);
  assert.deepEqual(r, redact({}));
  assert.equal(r.company, '');
  assert.equal(r.service, '');
  assert.equal(r.status, 'new');
  assert.equal(r.submittedAt, null);
});
