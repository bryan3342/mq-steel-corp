import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages } from '../worker/src/prompt.js';

test('default mode: user content includes the question and the serialized context', () => {
  const context = { facts: ['MQ Steel responds to new quotes within 1 business day.'] };
  const msgs = buildMessages({ question: 'What is our turnaround time?', context });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].role, 'user');
  assert.ok(msgs[0].content.includes('What is our turnaround time?'),
    'expected the raw question to appear in the user message');
  assert.ok(msgs[0].content.includes(JSON.stringify(context)),
    'expected the serialized context to appear in the user message');
});

test('mode:"analyze" returns the analyze instruction, not the raw question path', () => {
  const msgs = buildMessages({ question: 'ignored in analyze mode', context: {}, mode: 'analyze' });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].role, 'user');
  assert.ok(msgs[0].content.includes('JSON array'), 'expected a JSON array instruction');
  assert.ok(msgs[0].content.includes('"pattern"') && msgs[0].content.includes('"insight"'),
    'expected the pattern|insight type instruction');
  assert.ok(!msgs[0].content.includes('Staff question'),
    'analyze mode must not fall through to the default Q&A prompt');
  assert.ok(!msgs[0].content.includes('ignored in analyze mode'),
    'analyze mode must not echo the raw question');
});

test('context is capped at 24000 chars before being inserted into the prompt', () => {
  const bigContext = { blob: 'x'.repeat(30000) };
  const serialized = JSON.stringify(bigContext, null, 0);
  assert.ok(serialized.length > 24000, 'test setup sanity check: serialized context must exceed the cap');

  const msgs = buildMessages({ question: 'q', context: bigContext });
  const content = msgs[0].content;

  const match = content.match(/Context \(JSON\):\n([\s\S]*?)\n\nStaff question:/);
  assert.ok(match, 'expected to find the context block delimited in the prompt');
  assert.ok(match[1].length <= 24000, `expected capped context <= 24000 chars, got ${match[1].length}`);
  assert.equal(match[1], serialized.slice(0, 24000), 'expected exact 24000-char prefix of the serialized context');
});
