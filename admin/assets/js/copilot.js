import { auth, appCheck } from './firebase-config.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app-check.js';
import { loadMemory } from './memory.js';
import { redact, scrubText } from './redact.js';
import { t, getLang } from './i18n.js';

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
  'collapsible left sidebar to switch views (with a "Flux" item that opens this chat); and a light/dark theme toggle in the sidebar. ' +
  'A request that has "not been attended to" is one whose status is still "new".';

// Local YYYY-MM-DD (not UTC) so "today" matches how the console shows dates.
const ymd = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const subDate = (s) => s?.submittedAt?.toDate?.() ?? (s?.submittedAt ? new Date(s.submittedAt) : null);

// Precompute the aggregates a small model can't reliably derive by eyeballing raw
// rows (counts, today/this-week, unattended list, top companies). All fields here
// are non-PII: counts plus company/status/date only.
function computeStats(subs) {
  const now = new Date();
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  const week0 = new Date(day0); week0.setDate(week0.getDate() - 6);   // trailing 7 days incl. today
  const byStatus = { new: 0, contacted: 0, closed: 0 };
  const byCompany = {};
  const unattended = [];
  let today = 0, thisWeek = 0;
  for (const s of subs) {
    const st = (s.status || 'new').toLowerCase();
    byStatus[st] = (byStatus[st] || 0) + 1;
    const d = subDate(s);
    if (d) { if (d >= day0) today++; if (d >= week0) thisWeek++; }
    const comp = (s.company || '').trim();
    if (comp) byCompany[comp] = (byCompany[comp] || 0) + 1;
    if (st === 'new') unattended.push({ company: comp || '(no company)', service: scrubText(s.service || '').slice(0, 90), date: d ? ymd(d) : null });
  }
  unattended.sort((a, b) => (a.date || '').localeCompare(b.date || ''));   // oldest first
  const topCompanies = Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  return { total: subs.length, byStatus, today, thisWeek, unattendedCount: byStatus.new || 0, unattended: unattended.slice(0, 30), topCompanies };
}

async function buildContext() {
  const subs = (window.__getSubmissions?.() || []);
  const mem = await loadMemory().catch(() => ({ fact: [], insight: [], pattern: [], request: [] }));
  const now = new Date();
  return {
    today: ymd(now),
    now: now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    about: CONSOLE_GUIDE,
    stats: computeStats(subs),
    facts: mem.fact.map((f) => f.text),
    insights: mem.insight.map((i) => i.text),
    patterns: mem.pattern.map((p) => p.text),
    requests: subs.slice(0, 150).map(redact),   // redacted rows kept for specifics; stats carry the counts
  };
}

// Conversation memory: prior user/assistant turns (text only), sent so follow-ups work.
const history = [];

async function ask(question) {
  el('flux-prompts')?.remove();          // quick prompts disappear after the first use (chip click or typed message)
  bubble('user', question);
  const thinking = document.createElement('div');
  thinking.className = 'msg msg--assistant is-thinking';
  thinking.setAttribute('aria-label', t('Flux is thinking'));
  for (let i = 0; i < 3; i++) { const d = document.createElement('span'); d.className = 'dot'; thinking.append(d); }
  log().append(thinking);
  log().scrollTop = log().scrollHeight;
  try {
    const context = await buildContext();
    const res = await fetch(WORKER_URL, { method: 'POST', headers: await authHeaders(),
      body: JSON.stringify({ question, context, history: history.slice(-8), lang: getLang() }) });
    thinking.remove();
    if (!res.ok) { bubble('assistant', res.status === 429 ? t('Slow down a moment and try again.') : t('Sorry — I could not answer just now.')); return; }
    const { text } = await res.json();
    bubble('assistant', text);
    history.push({ role: 'user', content: question }, { role: 'assistant', content: text });
    if (history.length > 20) history.splice(0, history.length - 20);   // keep memory bounded
  } catch { thinking.remove(); bubble('assistant', t('Network problem — please retry.')); }
}

// ── Widget open / close (right-side drawer) ──────────────────────────────────
const isOpen = () => el('flux')?.classList.contains('is-open');
let introShown = false;

function openFlux() {
  const root = el('flux'); if (!root) return;
  root.classList.add('is-open');
  el('flux-open')?.setAttribute('aria-expanded', 'true');
  el('flux-box')?.setAttribute('aria-hidden', 'false');
  if (!introShown) {
    introShown = true;
    bubble('assistant', t("Hi, I'm Flux — the MQ Steel Admin Assistant. I can summarize your requests, flag what still needs attention, and help you find your way around. Pick a prompt below or just ask."));
  }
  setTimeout(() => el('assistant-input')?.focus(), 140);   // focus once the drawer has slid in
}
function closeFlux() {
  const root = el('flux'); if (!root) return;
  root.classList.remove('is-open');
  el('flux-open')?.setAttribute('aria-expanded', 'false');
  el('flux-box')?.setAttribute('aria-hidden', 'true');
  el('flux-open')?.focus();
}

export function initCopilot() {
  const form = el('assistant-form');
  const opener = el('flux-open');
  if (!form || !opener) return;

  opener.addEventListener('click', () => (isOpen() ? closeFlux() : openFlux()));
  el('flux-close')?.addEventListener('click', closeFlux);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) closeFlux(); });

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
