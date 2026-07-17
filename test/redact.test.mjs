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
