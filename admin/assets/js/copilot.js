import { auth, appCheck } from './firebase-config.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app-check.js';
import { loadMemory } from './memory.js';
import { redact } from './redact.js';

const WORKER_URL = 'https://mq-steel-assistant.bryanmejiaeducation.workers.dev/chat';

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

// Short description of the console so Flux can help with navigation. Sent as context
// (no PII). window.__getSubmissions is a read-only accessor exposed by app.js.
const CONSOLE_GUIDE =
  'You are Flux, the friendly MQ Steel Corp admin assistant, embedded in the admin dashboard. ' +
  'The console has: an Overview view (KPIs — handled %, total requests with a status donut, ' +
  'requests-over-time, plus site visits and conversion rate); a Requests view (a searchable table ' +
  'with status tabs All/New/Contacted/Closed, a per-request status selector, and internal notes); a ' +
  'collapsible left sidebar to switch views; and a light/dark theme toggle at the bottom of the sidebar. ' +
  'A request that has "not been attended to" is one whose status is still "new".';

async function buildContext() {
  const subs = (window.__getSubmissions?.() || []);
  const mem = await loadMemory().catch(() => ({ fact: [], insight: [], pattern: [], request: [] }));
  return {
    about: CONSOLE_GUIDE,
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

// ── Widget open / close ──────────────────────────────────────────────────────
let introShown = false;
function openFlux() {
  const box = el('flux-box'); if (!box) return;
  box.hidden = false;
  el('flux')?.classList.add('is-open');
  el('flux-launcher')?.setAttribute('aria-expanded', 'true');
  if (!introShown) {
    introShown = true;
    bubble('assistant', "Hi, I'm Flux — the MQ Steel Admin Assistant. I can summarize your requests, flag what still needs attention, and help you find your way around. Pick a prompt below or just ask.");
  }
  el('assistant-input')?.focus();
}
function closeFlux() {
  const box = el('flux-box'); if (!box) return;
  box.hidden = true;
  el('flux')?.classList.remove('is-open');
  el('flux-launcher')?.setAttribute('aria-expanded', 'false');
}

export function initCopilot() {
  const form = el('assistant-form');
  const launcher = el('flux-launcher');
  if (!form || !launcher) return;

  launcher.addEventListener('click', () => (el('flux-box').hidden ? openFlux() : closeFlux()));
  el('flux-close')?.addEventListener('click', closeFlux);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el('flux-box')?.hidden) closeFlux();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = el('assistant-input').value.trim(); if (!q) return;
    el('assistant-input').value = '';
    ask(q);
  });

  el('flux-prompts')?.querySelectorAll('.flux__chip').forEach((chip) =>
    chip.addEventListener('click', () => ask(chip.textContent.trim())));
}
initCopilot();
