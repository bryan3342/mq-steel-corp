import { auth, appCheck } from './firebase-config.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app-check.js';
import { loadMemory } from './memory.js';
import { redact } from './redact.js';

// v1 scope: this module only wires the CHAT path (read memory → ask the Worker →
// render the reply). Auto-enrichment of companyMemory (upsertRequestEntries,
// saveInsight, savePatterns from memory.js) is a deliberate follow-up — a
// "Refresh insights" action wired to those functions is not built here.

// OWNER TODO: replace with the real Worker URL once deployed (see Task 9).
const WORKER_URL = 'https://mq-steel-assistant.REPLACE.workers.dev/chat';

const el = (id) => document.getElementById(id);
const log = () => el('assistant-log');

function bubble(role, text) {
  const p = document.createElement('p');
  p.className = `msg msg--${role}`;
  p.textContent = text;                 // textContent — never innerHTML (model output is untrusted)
  log().append(p);
  log().scrollTop = log().scrollHeight;
}

async function authHeaders() {
  const idToken = await auth.currentUser.getIdToken();
  const ac = await getToken(appCheck, false);
  return { Authorization: `Bearer ${idToken}`, 'X-Firebase-AppCheck': ac.token, 'content-type': 'application/json' };
}

// window.__getSubmissions is a tiny read accessor exposed by app.js (step 4).
async function buildContext() {
  const subs = (window.__getSubmissions?.() || []);
  const mem = await loadMemory().catch(() => ({ fact: [], insight: [], pattern: [], request: [] }));
  return {
    facts: mem.fact.map((f) => f.text),
    insights: mem.insight.map((i) => i.text),
    patterns: mem.pattern.map((p) => p.text),
    requests: subs.slice(0, 200).map(redact),   // redacted, capped — no name/email leaves the browser
  };
}

async function ask(question) {
  bubble('user', question);
  const thinking = document.createElement('p');
  thinking.className = 'msg msg--assistant is-thinking'; thinking.textContent = '…';
  log().append(thinking);
  try {
    const context = await buildContext();
    const res = await fetch(WORKER_URL, { method: 'POST', headers: await authHeaders(),
      body: JSON.stringify({ question, context }) });
    thinking.remove();
    if (!res.ok) { bubble('assistant', res.status === 429 ? 'Slow down a moment and try again.' : 'Sorry — I could not answer just now.'); return; }
    const { text } = await res.json();
    bubble('assistant', text);
  } catch { thinking.remove(); bubble('assistant', 'Network problem — please retry.'); }
}

export function initCopilot() {
  const form = el('assistant-form'); if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = el('assistant-input').value.trim(); if (!q) return;
    el('assistant-input').value = '';
    ask(q);
  });
}
initCopilot();
