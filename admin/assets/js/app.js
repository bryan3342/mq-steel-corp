import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword, sendEmailVerification, signOut, onAuthStateChanged,
  setPersistence, browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const STATUSES = ['new', 'contacted', 'closed'];
const STATUS_LABELS = { new: 'New', contacted: 'Contacted', closed: 'Closed' };
// Categorical status palette — validated CVD-safe (worst pair ΔE 16.2) + always paired
// with text labels. Mirrors the CSS --new/--contacted/--closed tokens.
const STATUS_COLORS = { new: '#2563eb', contacted: '#d97706', closed: '#16a34a' };
const el = (id) => document.getElementById(id);

// IMPORTANT: every value from a submission is written with `textContent` (never
// innerHTML) — submissions are stored raw from the public form, so this is the
// stored-XSS guard. Do not introduce innerHTML with submission data. (Chart.js draws
// labels to a canvas, not the DOM, so chart labels are not an HTML-injection vector.)

// ─── Demo mode ────────────────────────────────────────────────────────────────
function isDemoMode() {
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  return local && new URLSearchParams(location.search).has('demo');
}
const DEMO = isDemoMode();

const DEMO_SUBMISSIONS = [
  { id: 'd1', name: 'Jane Contractor', email: 'jane@ironworks.example', company: 'Ironworks LLC',
    service: 'Structural steel fabrication for a 3-story mixed-use building — approx. 40 tons, delivery targeted for Q4.',
    status: 'new', submittedAt: { toDate: () => new Date('2026-07-14T10:20:00') } },
  { id: 'd2', name: 'Marcus Reed', email: 'm.reed@example.com', company: 'Ironworks LLC',
    service: 'Quote request for steel beam erection on a warehouse expansion (~12,000 sq ft).',
    status: 'contacted', adminNotes: 'Called 7/13 — sending an estimate this week.',
    submittedAt: { toDate: () => new Date('2026-07-12T15:05:00') } },
  { id: 'd3', name: 'Priya Nair', email: 'priya@devgroup.example', company: 'DevGroup',
    service: 'Custom staircase and railing fabrication for an office lobby. Looking for a modern industrial look.',
    status: 'closed', adminNotes: 'Completed and invoiced 7/09.',
    submittedAt: { toDate: () => new Date('2026-07-08T08:45:00') } },
  { id: 'd4', name: 'Tom Alvarez', email: 'tom.alvarez@example.com', company: 'Alvarez Builders',
    service: 'Need miscellaneous metals + embed plates for a foundation pour scheduled next month.',
    status: 'new', submittedAt: { toDate: () => new Date('2026-07-15T07:30:00') } },
  { id: 'd5', name: 'Dana Whitfield', email: 'dana.w@example.org', company: 'Whitfield Architects',
    service: 'Exploring a partnership for ongoing structural steel work across multiple commercial projects.',
    status: 'contacted', adminNotes: 'Intro meeting booked for 7/18.',
    submittedAt: { toDate: () => new Date('2026-07-11T13:10:00') } },
];

const views = {
  loading: el('loading-view'),
  signin:  el('signin-view'),
  verify:  el('verify-view'),
  denied:  el('denied-view'),
  error:   el('error-view'),
  app:     el('app-view'),
};

let unsubscribeSubmissions = null;
let submissionsCache = [];
let currentUser = null;
let statusFilter = 'all';
let granularity = 'daily';
const charts = {};
let latestMetrics = null;

function showView(name) {
  Object.entries(views).forEach(([k, node]) => { if (node) node.hidden = k !== name; });
  el('app-header').hidden = name !== 'app';
}

showView('loading');

let toastTimer = null;
function toast(msg, isError = false) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.toggle('toast--error', isError);
  t.classList.add('toast--show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('toast--show'), 2800);
}

function showMsg(text, isError = false) {
  const m = el('signin-msg');
  m.textContent = text;
  m.classList.toggle('form-msg--error', isError);
  m.hidden = false;
}
function clearMsg() { el('signin-msg').hidden = true; }

const normalizeEmail = (email) => (email ?? '').trim().toLowerCase();

function formatDate(ts) {
  try {
    return ts?.toDate?.().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) ?? '—';
  } catch { return '—'; }
}

function friendlyAuthError(err) {
  return ({
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-not-found': 'No account found — contact IT to get access.',
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-disabled': 'This account is disabled. Contact IT.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network problem. Check your connection and retry.',
  }[err?.code] ?? 'Something went wrong. Please try again.');
}

// NOTE: startup (control wiring + the demo/auth kickoff) runs at the very bottom of
// this file — after every const/function is declared — so the synchronous demo path
// can't reach a not-yet-initialized `const` (e.g. startOfDay/hasChart) in its TDZ.

function wireAuthControls() {
  document.querySelectorAll('[data-signout]').forEach((b) =>
    b.addEventListener('click', () =>
      signOut(auth).catch((err) => console.error('sign-out:', err?.code ?? 'unknown'))));

  el('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsg();
    const email = normalizeEmail(el('email').value);
    const password = el('password').value;
    setFormBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged routes from here.
    } catch (err) {
      console.error('sign-in:', err?.code ?? 'unknown');
      showMsg(friendlyAuthError(err), true);
    } finally {
      setFormBusy(false);
    }
  });

  el('verify-continue').addEventListener('click', async () => {
    if (!currentUser) return;
    try {
      await currentUser.reload();
      const u = auth.currentUser;
      if (u?.emailVerified) evaluateAccess(u);
      else toast('Not verified yet — contact IT if this persists.', true);
    } catch (err) {
      console.error('reload:', err?.code ?? 'unknown');
    }
  });

  el('resend-btn').addEventListener('click', async () => {
    if (!currentUser) return;
    try { await sendEmailVerification(currentUser); toast('Verification email sent.'); }
    catch (err) { console.error('resend:', err?.code ?? 'unknown'); toast('Could not send just now — try again shortly.', true); }
  });

  el('error-retry').addEventListener('click', () => {
    if (auth.currentUser) evaluateAccess(auth.currentUser);
  });
}

function setFormBusy(busy) {
  el('signin-btn').disabled = busy;
  el('email').disabled = busy;
  el('password').disabled = busy;
}

// ─── Access routing ──────────────────────────────────────────────────────────
async function evaluateAccess(user) {
  showView('loading');

  let snap;
  try {
    snap = await getDoc(doc(db, 'admins', normalizeEmail(user.email)));
  } catch (err) {
    console.error('admin-check:', err?.code ?? 'unknown');
    showView('error');
    return;
  }

  // Auth may have changed while awaiting — don't route a stale/superseded user.
  if (auth.currentUser !== user) return;

  if (!snap.exists()) {
    el('denied-email').textContent = user.email ?? '';
    showView('denied');
    return;
  }
  if (!user.emailVerified) {
    el('verify-email').textContent = user.email ?? '';
    showView('verify');
    return;
  }

  el('user-email').textContent = user.email ?? '';
  showView('app');
  subscribeSubmissions();
}

function startDemo() {
  const banner = document.createElement('div');
  banner.className = 'demo-banner';
  banner.textContent = 'DEMO MODE — sample data, nothing is saved.';
  document.body.prepend(banner);

  document.querySelectorAll('[data-signout]').forEach((b) =>
    b.addEventListener('click', () => { location.search = ''; }));

  el('user-email').textContent = 'demo@mqsteelcorp.com';
  submissionsCache = DEMO_SUBMISSIONS.map((s) => ({ ...s }));
  showView('app');
  renderDashboard();
}

// ─── Data (loaded only after the admin check passes) ─────────────────────────
function subscribeSubmissions() {
  if (unsubscribeSubmissions) { unsubscribeSubmissions(); unsubscribeSubmissions = null; }
  const q = query(collection(db, 'submissions'), orderBy('submittedAt', 'desc'));
  unsubscribeSubmissions = onSnapshot(
    q,
    (snap) => {
      submissionsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderDashboard();
    },
    (err) => {
      console.error('submissions:', err?.code ?? 'unknown');
      toast('Could not load requests.', true);
    },
  );
}

function renderDashboard() {
  const m = computeMetrics(submissionsCache);
  latestMetrics = m;
  renderMetrics(m);
  updateCharts(m);
  renderRequests();
}

function setDashView(view) {
  const requestsOnly = view === 'requests';
  el('kpi-row').hidden = requestsOnly;
  el('ranking-panel').hidden = requestsOnly;
  el('dash-grid').classList.toggle('dash-grid--full', requestsOnly);
}

// ─── Metrics ─────────────────────────────────────────────────────────────────
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

function computeMetrics(subs) {
  const now = new Date();
  const dated = subs
    .map((s) => ({ d: s.submittedAt?.toDate?.() ?? null }))
    .filter((s) => s.d instanceof Date && !Number.isNaN(s.d.getTime()))
    .map((s) => s.d);

  const byStatus = { new: 0, contacted: 0, closed: 0 };
  const companies = new Map();
  for (const s of subs) {
    const st = STATUSES.includes(s.status) ? s.status : 'new';
    byStatus[st] += 1;
    const c = (s.company || '').trim();
    if (c) companies.set(c, (companies.get(c) || 0) + 1);
  }

  const total = subs.length;
  const handled = byStatus.contacted + byStatus.closed;
  const handledPct = total ? Math.round((handled / total) * 100) : 0;

  const tomorrow = startOfDay(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const countBetween = (start, end) => dated.filter((d) => d >= start && d < end).length;
  const shift = (base, days) => { const x = new Date(base); x.setDate(x.getDate() + days); return x; };
  const wStart = shift(tomorrow, -7), wPrev = shift(wStart, -7);
  const mStart = shift(tomorrow, -30), mPrev = shift(mStart, -30);

  const topCompanies = [...companies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  return {
    total, byStatus, handled, handledPct, open: byStatus.new,
    thisWeek: countBetween(wStart, tomorrow), lastWeek: countBetween(wPrev, wStart),
    thisMonth: countBetween(mStart, tomorrow), lastMonth: countBetween(mPrev, mStart),
    topCompanies,
    buckets: {
      daily:   buildBuckets(dated, 'daily'),
      weekly:  buildBuckets(dated, 'weekly'),
      monthly: buildBuckets(dated, 'monthly'),
    },
  };
}

function buildBuckets(dated, gran) {
  const now = new Date();
  const out = [];
  const between = (start, end) => dated.filter((d) => d >= start && d < end).length;

  if (gran === 'daily') {
    for (let i = 29; i >= 0; i -= 1) {
      const day = startOfDay(now); day.setDate(day.getDate() - i);
      const next = new Date(day); next.setDate(next.getDate() + 1);
      out.push({ label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: between(day, next) });
    }
  } else if (gran === 'weekly') {
    for (let i = 11; i >= 0; i -= 1) {
      const end = startOfDay(now); end.setDate(end.getDate() - i * 7 + 1);
      const start = new Date(end); start.setDate(start.getDate() - 7);
      out.push({ label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: between(start, end) });
    }
  } else {
    for (let i = 11; i >= 0; i -= 1) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      out.push({ label: m.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), count: between(m, next) });
    }
  }
  return out;
}

function setDelta(node, delta, suffix) {
  if (!node) return;
  const sign = delta > 0 ? '+' : '';
  node.textContent = `${sign}${delta}${suffix ? ` ${suffix}` : ''}`;
  node.classList.toggle('is-up', delta > 0);
  node.classList.toggle('is-down', delta < 0);
}

function renderMetrics(m) {
  el('kpi-total').textContent = m.total;
  el('kpi-open').textContent = `${m.open} open`;
  el('kpi-handled').textContent = `${m.handledPct}%`;
  el('kpi-handled-bar').style.width = `${m.handledPct}%`;
  setDelta(el('kpi-total-badge'), m.thisMonth - m.lastMonth, 'mo');

  const monthly = granularity === 'monthly';
  el('kpi-period-count').textContent = monthly ? m.thisMonth : m.thisWeek;
  setDelta(el('kpi-period-delta'), (monthly ? m.thisMonth - m.lastMonth : m.thisWeek - m.lastWeek), '');

  // status legend (dot + label + count; identity is never color-alone)
  const ul = el('status-legend');
  ul.replaceChildren();
  for (const st of STATUSES) {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'legend-dot'; dot.style.background = STATUS_COLORS[st];
    const lab = document.createElement('span'); lab.className = 'legend-label'; lab.textContent = STATUS_LABELS[st];
    const val = document.createElement('span'); val.className = 'legend-val'; val.textContent = m.byStatus[st];
    li.append(dot, lab, val);
    ul.append(li);
  }
}

// ─── Charts (Chart.js UMD global; guarded for CDN load order) ────────────────
const hasChart = () => typeof window.Chart !== 'undefined';

function updateCharts(m) {
  if (m) latestMetrics = m;
  if (!hasChart()) {                       // Chart.js CDN not parsed yet — retry on load
    window.addEventListener('load', () => updateCharts(), { once: true });
    return;
  }
  ensureCharts();
  const cur = latestMetrics;
  if (!cur) return;

  charts.status.data.datasets[0].data = [cur.byStatus.new, cur.byStatus.contacted, cur.byStatus.closed];
  charts.status.update();

  const b = cur.buckets[granularity] ?? [];
  charts.trend.data.labels = b.map((x) => x.label);
  charts.trend.data.datasets[0].data = b.map((x) => x.count);
  charts.trend.update();

  charts.companies.data.labels = cur.topCompanies.map(([c]) => c);
  charts.companies.data.datasets[0].data = cur.topCompanies.map(([, n]) => n);
  charts.companies.update();
}

function ensureCharts() {
  if (charts.status || !hasChart()) return;
  const { Chart } = window;
  const line = '#e2e8f0';
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.color = '#475569';

  charts.status = new Chart(el('status-chart'), {
    type: 'doughnut',
    data: {
      labels: [STATUS_LABELS.new, STATUS_LABELS.contacted, STATUS_LABELS.closed],
      datasets: [{ data: [0, 0, 0], borderWidth: 2, borderColor: '#ffffff',
        backgroundColor: [STATUS_COLORS.new, STATUS_COLORS.contacted, STATUS_COLORS.closed] }],
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: { legend: { display: false } } },
  });

  charts.trend = new Chart(el('trend-chart'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Requests', data: [],
      borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,0.12)',
      borderWidth: 2, fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5,
      pointBackgroundColor: '#d97706' }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { beginAtZero: true, grid: { color: line }, ticks: { precision: 0, maxTicksLimit: 5 } },
      } },
  });

  charts.companies = new Chart(el('companies-chart'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Requests', data: [],
      backgroundColor: '#2563eb', borderRadius: 4, borderSkipped: false, barThickness: 14 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { color: line }, ticks: { precision: 0, maxTicksLimit: 5 } },
        y: { grid: { display: false } },
      } },
  });
}

function destroyCharts() {
  for (const k of Object.keys(charts)) { charts[k]?.destroy?.(); delete charts[k]; }
}

// ─── Requests table ──────────────────────────────────────────────────────────
function renderRequests() {
  const term = el('search-input').value.trim().toLowerCase();
  const rows = submissionsCache.filter((s) => {
    if (statusFilter !== 'all' && (s.status ?? 'new') !== statusFilter) return false;
    if (!term) return true;
    return [s.name, s.email, s.company, s.service].some((v) => (v ?? '').toLowerCase().includes(term));
  });

  el('requests-count').textContent =
    `${rows.length}${rows.length !== submissionsCache.length ? ` / ${submissionsCache.length}` : ''}`;

  // Preserve an in-progress note edit so a live snapshot doesn't wipe half-typed text.
  const active = document.activeElement;
  let editing = null;
  if (active && active.tagName === 'TEXTAREA' && active.closest('.card')) {
    editing = {
      id: active.closest('.card').dataset.id,
      value: active.value, start: active.selectionStart, end: active.selectionEnd,
    };
  }

  const list = el('requests-list');
  list.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = submissionsCache.length ? 'No requests match your filters.' : 'No requests yet.';
    list.append(empty);
    return;
  }
  rows.forEach((s) => list.append(renderCard(s)));

  if (editing) {
    const card = list.querySelector(`.card[data-id="${CSS.escape(editing.id)}"]`);
    const ta = card?.querySelector('textarea');
    if (ta) {
      ta.value = editing.value;
      ta.focus();
      try { ta.setSelectionRange(editing.start, editing.end); } catch { /* noop */ }
    }
  }
}

function fieldLabel(text) {
  const span = document.createElement('span');
  span.className = 'field__label';
  span.textContent = text;
  return span;
}

function renderCard(s) {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.status = s.status ?? 'new';
  card.dataset.id = s.id;

  const head = document.createElement('div');
  head.className = 'card__head';
  const name = document.createElement('h3');
  name.className = 'card__name';
  name.textContent = s.name || '(no name)';
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = s.status ?? 'new';
  const date = document.createElement('time');
  date.className = 'card__date';
  date.textContent = formatDate(s.submittedAt);
  head.append(name, badge, date);

  const contact = document.createElement('div');
  contact.className = 'card__contact';
  const emailLink = document.createElement('a');
  emailLink.href = 'mailto:' + (s.email ?? '');
  emailLink.textContent = s.email || '—';
  contact.append(emailLink);
  if (s.company) {
    const comp = document.createElement('span');
    comp.textContent = ' · ' + s.company;
    contact.append(comp);
  }

  const msg = document.createElement('p');
  msg.className = 'card__message';
  msg.textContent = s.service || '';

  const controls = document.createElement('div');
  controls.className = 'card__controls';

  const statusField = document.createElement('label');
  statusField.className = 'field';
  statusField.append(fieldLabel('Status'));
  const select = document.createElement('select');
  STATUSES.forEach((st) => {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = st.charAt(0).toUpperCase() + st.slice(1);
    if ((s.status ?? 'new') === st) opt.selected = true;
    select.append(opt);
  });
  select.addEventListener('change', async () => {
    const applyLocal = () => { s.status = select.value; card.dataset.status = select.value; badge.textContent = select.value; };
    if (DEMO) { applyLocal(); toast('Demo mode — change not saved.'); return; }
    select.disabled = true;
    try {
      await updateDoc(doc(db, 'submissions', s.id), { status: select.value, updatedAt: serverTimestamp() });
      applyLocal();
      toast('Status updated.');
    } catch (err) {
      console.error('update-status:', err?.code ?? 'unknown');
      toast('Could not update status.', true);
    } finally {
      select.disabled = false;
    }
  });
  statusField.append(select);

  const notesField = document.createElement('label');
  notesField.className = 'field field--grow';
  notesField.append(fieldLabel('Internal notes'));
  const notes = document.createElement('textarea');
  notes.rows = 2;
  notes.value = s.adminNotes ?? '';
  notes.placeholder = 'Add a note for your team…';
  const saveNote = document.createElement('button');
  saveNote.type = 'button';
  saveNote.className = 'btn btn--small';
  saveNote.textContent = 'Save note';
  saveNote.addEventListener('click', async () => {
    if (DEMO) { s.adminNotes = notes.value; toast('Demo mode — note not saved.'); return; }
    saveNote.disabled = true;
    try {
      await updateDoc(doc(db, 'submissions', s.id), { adminNotes: notes.value, updatedAt: serverTimestamp() });
      toast('Note saved.');
    } catch (err) {
      console.error('update-notes:', err?.code ?? 'unknown');
      toast('Could not save note.', true);
    } finally {
      saveNote.disabled = false;
    }
  });
  notesField.append(notes, saveNote);

  controls.append(statusField, notesField);
  card.append(head, contact, msg, controls);
  return card;
}

// ─── Startup ─────────────────────────────────────────────────────────────────
// Runs last, after every declaration above is initialized. Dashboard controls are
// wired even while app-view is hidden (the elements exist in the DOM regardless).
el('search-input').addEventListener('input', renderRequests);

el('status-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  el('status-tabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === btn));
  statusFilter = btn.dataset.status;
  renderRequests();
});

el('granularity').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg__btn');
  if (!btn) return;
  el('granularity').querySelectorAll('.seg__btn').forEach((b) => b.classList.toggle('is-active', b === btn));
  granularity = btn.dataset.gran;
  if (latestMetrics) { updateCharts(latestMetrics); renderMetrics(latestMetrics); }
});

el('dash-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.navlink');
  if (!btn) return;
  el('dash-nav').querySelectorAll('.navlink').forEach((n) => n.classList.toggle('is-active', n === btn));
  setDashView(btn.dataset.view);
});

if (DEMO) {
  startDemo();
} else {
  setPersistence(auth, browserSessionPersistence)
    .catch((err) => console.error('persistence:', err?.code ?? 'unknown'));

  wireAuthControls();

  onAuthStateChanged(auth, (user) => {
    if (unsubscribeSubmissions) { unsubscribeSubmissions(); unsubscribeSubmissions = null; }
    submissionsCache = [];
    destroyCharts();
    currentUser = user;
    if (!user) { showView('signin'); return; }
    evaluateAccess(user);
  });
}
