import { auth, db } from './firebase-config.js';
import { t as tr, onLangChange } from './i18n.js';
import {
  signInWithEmailAndPassword, sendEmailVerification, signOut, onAuthStateChanged,
  setPersistence, browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, where, documentId,
  updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const STATUSES = ['new', 'contacted', 'closed'];
const STATUS_LABELS = { new: 'New', contacted: 'Contacted', closed: 'Closed' };
// Status colors live in CSS (--new/--contacted/--closed) and are read via getComputedStyle,
// so charts + legend track the light/dark theme. Palette validated CVD-safe (worst pair ΔE 16.2).
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
let analyticsCache = [];              // [{ date: Date, views, sessions }]
let latestVisitorMetrics = null;
// Business-tz day id — must match analytics.js so visit buckets line up.
const dayId = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);

// ─── UI helpers: motion, theme, sidebar ──────────────────────────────────────
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;
const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();
const THEME_KEY = 'mq_admin_theme';
const SIDEBAR_KEY = 'mq_admin_sidebar';

// rAF count-up that always lands on the exact value; supersede-guarded against
// overlapping snapshots; snaps immediately under reduced-motion.
function animateNumber(node, to, { suffix = '', format } = {}) {
  if (!node) return;
  const fmt = format || ((n) => String(Math.round(n)));
  const from = parseFloat((node.textContent || '').replace(/[^\d.-]/g, '')) || 0;
  if (REDUCE.matches || from === to) { node.textContent = fmt(to) + suffix; return; }
  if (node.__anim) cancelAnimationFrame(node.__anim);
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 700);
    node.textContent = fmt(from + (to - from) * ease(p)) + suffix;
    if (p < 1) node.__anim = requestAnimationFrame(step);
    else { node.textContent = fmt(to) + suffix; node.__anim = null; }
  };
  node.__anim = requestAnimationFrame(step);
}

function playViewEnter(node) {
  if (!node || REDUCE.matches) return;
  node.classList.remove('view-enter');
  void node.offsetWidth;                 // force reflow so the animation restarts
  node.classList.add('view-enter');
}

const currentTheme = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');
function applyTheme(theme, { animate = false } = {}) {
  if (animate && !REDUCE.matches) {
    root.classList.add('theme-switching');
    setTimeout(() => root.classList.remove('theme-switching'), 300);
  }
  root.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage blocked */ }
  const btn = el('theme-toggle');
  if (btn) btn.setAttribute('aria-pressed', String(theme === 'dark'));
  applyChartTheme();
  recolorLegend();
}
function wireTheme() {
  const btn = el('theme-toggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
  btn.addEventListener('click', () =>
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', { animate: true }));
}

function applySidebar(collapsed) {
  el('app-view').classList.toggle('dash--collapsed', collapsed);
  const btn = el('sidebar-toggle');
  if (btn) {
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  }
  try { localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded'); } catch { /* noop */ }
}
function wireSidebar() {
  let collapsed = false;
  try { collapsed = localStorage.getItem(SIDEBAR_KEY) === 'collapsed'; } catch { /* noop */ }
  applySidebar(collapsed);   // applied while #app-view is hidden → no first-paint animation
  const btn = el('sidebar-toggle');
  if (btn) btn.addEventListener('click', () =>
    applySidebar(!el('app-view').classList.contains('dash--collapsed')));
}

function showView(name) {
  Object.entries(views).forEach(([k, node]) => { if (node) node.hidden = k !== name; });
  el('app-header').hidden = name !== 'app';
  playViewEnter(views[name]);
}

showView('loading');

let toastTimer = null;
function toast(msg, isError = false) {
  const t = el('toast');
  t.textContent = tr(msg);
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

  showView('app');
  subscribeSubmissions();
  loadVisitorAnalytics();
}

function startDemo() {
  const banner = document.createElement('div');
  banner.className = 'demo-banner';
  banner.textContent = 'DEMO MODE — sample data, nothing is saved.';
  document.body.prepend(banner);

  document.querySelectorAll('[data-signout]').forEach((b) =>
    b.addEventListener('click', () => { location.search = ''; }));

  submissionsCache = DEMO_SUBMISSIONS.map((s) => ({ ...s }));
  analyticsCache = buildDemoAnalytics();
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

// Visitor analytics: a one-shot range read of the last ~365 day-ids — NOT a live
// subscription (analytics is periodic, not live-critical, and onSnapshot would stream
// every site hit into the tab). Range on the document id needs no composite index.
async function loadVisitorAnalytics() {
  try {
    const start = new Date(); start.setDate(start.getDate() - 365);
    const snap = await getDocs(query(collection(db, 'analytics_daily'), where(documentId(), '>=', dayId(start))));
    analyticsCache = snap.docs.map((d) => {
      const v = d.data();
      return { date: new Date(`${d.id}T00:00:00`), views: v.views || 0, sessions: v.sessions || 0 };
    });
    renderDashboard();
  } catch (err) {
    console.error('analytics:', err?.code ?? 'unknown');   // non-fatal — requests dashboard still works
  }
}

function buildDemoAnalytics() {
  const out = [];
  const today = startOfDay(new Date());
  for (let i = 39; i >= 0; i -= 1) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const views = (weekend ? 14 : 28) + (i % 5) * 2;
    out.push({ date: d, views, sessions: Math.round(views * 0.68) });
  }
  return out;
}

function renderDashboard() {
  const m = computeMetrics(submissionsCache);
  latestMetrics = m;
  const vm = computeVisitorMetrics(analyticsCache);
  latestVisitorMetrics = vm;
  renderMetrics(m);
  renderVisitorMetrics(m, vm);
  updateCharts(m);
  updateVisitorCharts(vm);
  renderRequests();
}

function setDashView(view) {
  const requestsOnly = view === 'requests';
  const documents = view === 'documents';
  el('kpi-row').hidden = requestsOnly || documents;
  el('visitor-row').hidden = requestsOnly || documents;
  el('ranking-panel').hidden = requestsOnly || documents;
  el('dash-grid').hidden = documents;
  el('dash-grid').classList.toggle('dash-grid--full', requestsOnly);
  const docPanel = el('documents-panel');
  if (docPanel) docPanel.hidden = !documents;
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

// Shared range generator so submissions + visits bucket on IDENTICAL period boundaries
// (keeps the conversion-rate numerator and denominator aligned).
function bucketRanges(gran) {
  const now = new Date();
  const out = [];
  if (gran === 'daily') {
    for (let i = 29; i >= 0; i -= 1) {
      const start = startOfDay(now); start.setDate(start.getDate() - i);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      out.push({ label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), start, end });
    }
  } else if (gran === 'weekly') {
    for (let i = 11; i >= 0; i -= 1) {
      const end = startOfDay(now); end.setDate(end.getDate() - i * 7 + 1);
      const start = new Date(end); start.setDate(start.getDate() - 7);
      out.push({ label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), start, end });
    }
  } else {
    for (let i = 11; i >= 0; i -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      out.push({ label: start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), start, end });
    }
  }
  return out;
}

function buildBuckets(dated, gran) {
  return bucketRanges(gran).map((r) => ({
    label: r.label,
    count: dated.filter((d) => d >= r.start && d < r.end).length,
  }));
}

function computeVisitorMetrics(rows) {
  const now = new Date();
  const dated = rows.filter((r) => r.date instanceof Date && !Number.isNaN(r.date.getTime()));
  const tomorrow = startOfDay(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const shift = (base, days) => { const x = new Date(base); x.setDate(x.getDate() + days); return x; };
  const sumBetween = (start, end, key) =>
    dated.reduce((a, r) => a + ((r.date >= start && r.date < end) ? (r[key] || 0) : 0), 0);
  const wStart = shift(tomorrow, -7), wPrev = shift(wStart, -7);
  const mStart = shift(tomorrow, -30), mPrev = shift(mStart, -30);
  const series = (gran) => bucketRanges(gran).map((r) => ({ label: r.label, value: sumBetween(r.start, r.end, 'views') }));
  return {
    thisWeekViews: sumBetween(wStart, tomorrow, 'views'), lastWeekViews: sumBetween(wPrev, wStart, 'views'),
    thisMonthViews: sumBetween(mStart, tomorrow, 'views'), lastMonthViews: sumBetween(mPrev, mStart, 'views'),
    thisWeekSessions: sumBetween(wStart, tomorrow, 'sessions'), lastWeekSessions: sumBetween(wPrev, wStart, 'sessions'),
    thisMonthSessions: sumBetween(mStart, tomorrow, 'sessions'), lastMonthSessions: sumBetween(mPrev, mStart, 'sessions'),
    buckets: { daily: series('daily'), weekly: series('weekly'), monthly: series('monthly') },
  };
}

function setDelta(node, delta, suffix) {
  if (!node) return;
  const sign = delta > 0 ? '+' : '';
  node.textContent = `${sign}${delta}${suffix ? ` ${suffix}` : ''}`;
  node.classList.toggle('is-up', delta > 0);
  node.classList.toggle('is-down', delta < 0);
}

function renderMetrics(m) {
  animateNumber(el('kpi-total'), m.total, { format: (n) => Math.round(n).toLocaleString() });
  el('kpi-open').textContent = `${m.open} ${tr('open')}`;
  animateNumber(el('kpi-handled'), m.handledPct, { suffix: '%' });
  el('kpi-handled-bar').style.width = `${m.handledPct}%`;
  setDelta(el('kpi-total-badge'), m.thisMonth - m.lastMonth, 'mo');

  const monthly = granularity === 'monthly';
  animateNumber(el('kpi-period-count'), monthly ? m.thisMonth : m.thisWeek);
  setDelta(el('kpi-period-delta'), (monthly ? m.thisMonth - m.lastMonth : m.thisWeek - m.lastWeek), '');

  // status legend (dot + label + count; identity is never color-alone)
  const ul = el('status-legend');
  ul.replaceChildren();
  for (const st of STATUSES) {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'legend-dot'; dot.style.background = cssVar(`--${st}`);
    const lab = document.createElement('span'); lab.className = 'legend-label'; lab.textContent = tr(STATUS_LABELS[st]);
    const val = document.createElement('span'); val.className = 'legend-val'; val.textContent = m.byStatus[st];
    li.append(dot, lab, val);
    ul.append(li);
  }
}

// Re-paint the legend dots when the theme flips (the --new/--contacted/--closed tokens change).
function recolorLegend() {
  const dots = document.querySelectorAll('#status-legend .legend-dot');
  STATUSES.forEach((st, i) => { if (dots[i]) dots[i].style.background = cssVar(`--${st}`); });
}

// Visitor KPIs: total visits (period) + conversion rate (requests ÷ sessions, same period).
function renderVisitorMetrics(m, vm) {
  const monthly = granularity === 'monthly';
  const views        = monthly ? vm.thisMonthViews    : vm.thisWeekViews;
  const prevViews    = monthly ? vm.lastMonthViews    : vm.lastWeekViews;
  const sessions     = monthly ? vm.thisMonthSessions : vm.thisWeekSessions;
  const prevSessions = monthly ? vm.lastMonthSessions : vm.lastWeekSessions;
  const subs         = monthly ? m.thisMonth          : m.thisWeek;
  const prevSubs     = monthly ? m.lastMonth          : m.lastWeek;

  animateNumber(el('kpi-visits'), views, { format: (n) => Math.round(n).toLocaleString() });
  el('kpi-visits-note').textContent = `${sessions.toLocaleString()} ${sessions === 1 ? tr('session') : tr('sessions')}`;
  setDelta(el('kpi-visits-badge'), views - prevViews, '');

  // Conversion can exceed 100% when sessions are under-counted; clamp the display. '—' when
  // there are no sessions yet (avoids a divide-by-zero reading as 0%).
  const cvr = sessions > 0 ? (subs / sessions) * 100 : null;
  const prevCvr = prevSessions > 0 ? (prevSubs / prevSessions) * 100 : null;
  el('kpi-cvr').textContent = cvr === null ? '—' : `${Math.min(cvr, 100).toFixed(1)}%`;
  el('kpi-cvr-note').textContent = `${subs} ${subs === 1 ? tr('request') : tr('requests')} ÷ ${sessions} ${sessions === 1 ? tr('session') : tr('sessions')}`;
  const badge = el('kpi-cvr-badge');
  if (cvr !== null && prevCvr !== null) setDelta(badge, Math.round(cvr - prevCvr), 'pt');
  else { badge.textContent = ''; badge.classList.remove('is-up', 'is-down'); }
}

// ─── Charts (Chart.js UMD global; guarded for CDN load order) ────────────────
const hasChart = () => typeof window.Chart !== 'undefined';

// Colors are read from CSS so charts follow the light/dark theme.
function readChartColors() {
  return {
    ink: cssVar('--chart-ink'), grid: cssVar('--chart-grid'), donutBorder: cssVar('--donut-border'),
    accent: cssVar('--accent'), trendFill: cssVar('--trend-fill'), visitsFill: cssVar('--visits-fill'),
    new: cssVar('--new'), contacted: cssVar('--contacted'), closed: cssVar('--closed'),
  };
}

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

function updateVisitorCharts(vm) {
  if (vm) latestVisitorMetrics = vm;
  if (!hasChart()) { window.addEventListener('load', () => updateVisitorCharts(), { once: true }); return; }
  ensureCharts();
  const cur = latestVisitorMetrics;
  if (!cur || !charts.visits) return;
  const b = cur.buckets[granularity] ?? [];
  charts.visits.data.labels = b.map((x) => x.label);
  charts.visits.data.datasets[0].data = b.map((x) => x.value);
  charts.visits.update();
}

function ensureCharts() {
  if (charts.status || !hasChart()) return;
  const { Chart } = window;
  const c = readChartColors();
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.color = c.ink;
  const animation = { duration: REDUCE.matches ? 0 : 600, easing: 'easeOutQuart' };

  charts.status = new Chart(el('status-chart'), {
    type: 'doughnut',
    data: {
      labels: [tr(STATUS_LABELS.new), tr(STATUS_LABELS.contacted), tr(STATUS_LABELS.closed)],
      datasets: [{ data: [0, 0, 0], borderWidth: 2, borderColor: c.donutBorder,
        backgroundColor: [c.new, c.contacted, c.closed] }],
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '68%', animation,
      plugins: { legend: { display: false } } },
  });

  charts.trend = new Chart(el('trend-chart'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Requests', data: [],
      borderColor: c.accent, backgroundColor: c.trendFill,
      borderWidth: 2, fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5,
      pointBackgroundColor: c.accent }] },
    options: { responsive: true, maintainAspectRatio: false, animation,
      plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.ink, precision: 0, maxTicksLimit: 5 } },
      } },
  });

  charts.companies = new Chart(el('companies-chart'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Requests', data: [],
      backgroundColor: c.new, borderRadius: 4, borderSkipped: false, barThickness: 14 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.ink, precision: 0, maxTicksLimit: 5 } },
        y: { grid: { display: false }, ticks: { color: c.ink } },
      } },
  });

  charts.visits = new Chart(el('visits-chart'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Visits', data: [],
      borderColor: c.new, backgroundColor: c.visitsFill,
      borderWidth: 2, fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5,
      pointBackgroundColor: c.new }] },
    options: { responsive: true, maintainAspectRatio: false, animation,
      plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.ink, precision: 0, maxTicksLimit: 5 } },
      } },
  });
}

// Re-color existing charts on a theme flip (no destroy → no instance leak).
function applyChartTheme() {
  if (!hasChart() || !charts.status) return;
  const c = readChartColors();
  window.Chart.defaults.color = c.ink;

  charts.status.data.datasets[0].borderColor = c.donutBorder;
  charts.status.data.datasets[0].backgroundColor = [c.new, c.contacted, c.closed];
  charts.status.update('none');

  const t = charts.trend;
  t.data.datasets[0].borderColor = c.accent;
  t.data.datasets[0].pointBackgroundColor = c.accent;
  t.data.datasets[0].backgroundColor = c.trendFill;
  t.options.scales.x.ticks.color = c.ink;
  t.options.scales.y.ticks.color = c.ink;
  t.options.scales.y.grid.color = c.grid;
  t.update('none');

  const v = charts.visits;
  if (v) {
    v.data.datasets[0].borderColor = c.new;
    v.data.datasets[0].pointBackgroundColor = c.new;
    v.data.datasets[0].backgroundColor = c.visitsFill;
    v.options.scales.x.ticks.color = c.ink;
    v.options.scales.y.ticks.color = c.ink;
    v.options.scales.y.grid.color = c.grid;
    v.update('none');
  }

  const co = charts.companies;
  if (co) {
    co.data.datasets[0].backgroundColor = c.new;
    co.options.scales.x.ticks.color = c.ink;
    co.options.scales.y.ticks.color = c.ink;
    co.options.scales.x.grid.color = c.grid;   // horizontal bar → grid is on the x axis
    co.update('none');
  }
}

function destroyCharts() {
  for (const k of Object.keys(charts)) { charts[k]?.destroy?.(); delete charts[k]; }
}

// ─── Requests table ──────────────────────────────────────────────────────────
const expanded = new Set();   // ids of open rows — survives live snapshots + re-renders

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
  if (active && active.tagName === 'TEXTAREA' && active.closest('.row-group')) {
    editing = {
      id: active.closest('.row-group').dataset.id,
      value: active.value, start: active.selectionStart, end: active.selectionEnd,
    };
  }

  const list = el('requests-list');
  list.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = tr(submissionsCache.length ? 'No requests match your filters.' : 'No requests yet.');
    list.append(empty);
    return;
  }

  list.append(renderTableHead());
  rows.forEach((s) => list.append(renderRow(s)));

  if (editing) {
    const group = list.querySelector(`.row-group[data-id="${CSS.escape(editing.id)}"]`);
    const ta = group?.querySelector('textarea');   // its detail is open (id is in `expanded`)
    if (ta) {
      ta.value = editing.value;
      ta.focus();
      try { ta.setSelectionRange(editing.start, editing.end); } catch { /* noop */ }
    }
  }
}

function renderTableHead() {
  const head = document.createElement('div');
  head.className = 'rtable__head';
  head.setAttribute('aria-hidden', 'true');   // decorative labels, not real <th>
  [['Requester', 'th--requester'], ['Company', 'th--company'], ['Service', 'th--service'],
    ['Status', 'th--status'], ['Submitted', 'th--date']].forEach(([text, cls]) => {
    const th = document.createElement('span');
    th.className = `rtable__th ${cls}`;
    th.textContent = tr(text);
    head.append(th);
  });
  return head;
}

function fieldLabel(text) {
  const span = document.createElement('span');
  span.className = 'field__label';
  span.textContent = text;
  return span;
}

function shortDate(ts) {
  try {
    return ts?.toDate?.().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? '—';
  } catch { return '—'; }
}

function cell(cls, text) {
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text;
  return span;
}

function renderRow(s) {
  const group = document.createElement('div');
  group.className = 'row-group';
  group.dataset.status = s.status ?? 'new';
  group.dataset.id = s.id;
  const isOpen = expanded.has(s.id);
  if (isOpen) group.classList.add('is-open');

  // Compact row — a native <button> (free focus + Enter/Space, correct tab order).
  const rowBtn = document.createElement('button');
  rowBtn.type = 'button';
  rowBtn.className = 'rrow';
  rowBtn.setAttribute('aria-expanded', String(isOpen));
  rowBtn.setAttribute('aria-controls', `rdetail-${s.id}`);

  const requester = document.createElement('span');
  requester.className = 'rcell rcell--requester';
  requester.append(cell('rcell__primary', s.name || '(no name)'), cell('rcell__muted', s.email || '—'));

  const statusCell = document.createElement('span');
  statusCell.className = 'rcell rcell--status';
  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.textContent = tr(STATUS_LABELS[s.status] ?? STATUS_LABELS.new);
  statusCell.append(pill);

  const dateCell = document.createElement('span');
  dateCell.className = 'rcell rcell--date';
  const dateEl = document.createElement('time');
  dateEl.textContent = shortDate(s.submittedAt);
  dateCell.append(dateEl);

  rowBtn.append(requester, cell('rcell rcell--company', s.company || '—'),
    cell('rcell rcell--service', s.service || ''), statusCell, dateCell);

  // Detail (full message + management controls)
  const detail = document.createElement('div');
  detail.className = 'rdetail';
  detail.id = `rdetail-${s.id}`;
  detail.hidden = !isOpen;

  const contact = document.createElement('p');
  contact.className = 'rdetail__contact';
  const emailLink = document.createElement('a');
  emailLink.href = 'mailto:' + (s.email ?? '');
  emailLink.textContent = s.email || '—';
  contact.append(emailLink);
  if (s.company) { const c = document.createElement('span'); c.textContent = ' · ' + s.company; contact.append(c); }
  const when = document.createElement('span'); when.textContent = ' · ' + formatDate(s.submittedAt); contact.append(when);

  const msg = document.createElement('p');
  msg.className = 'rdetail__message';
  msg.textContent = s.service || '';

  const controls = document.createElement('div');
  controls.className = 'rdetail__controls';

  const statusField = document.createElement('label');
  statusField.className = 'field';
  statusField.append(fieldLabel(tr('Status')));
  const select = document.createElement('select');
  STATUSES.forEach((st) => {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = tr(STATUS_LABELS[st]);
    if ((s.status ?? 'new') === st) opt.selected = true;
    select.append(opt);
  });
  const applyLocal = () => {
    s.status = select.value;
    group.dataset.status = select.value;
    pill.textContent = tr(STATUS_LABELS[select.value]);
  };
  select.addEventListener('change', async () => {
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
  notesField.append(fieldLabel(tr('Internal notes')));
  const notes = document.createElement('textarea');
  notes.rows = 3;
  notes.value = s.adminNotes ?? '';
  notes.placeholder = tr('Add a note for your team…');
  const saveNote = document.createElement('button');
  saveNote.type = 'button';
  saveNote.className = 'btn btn--small';
  saveNote.textContent = tr('Save note');
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
  detail.append(contact, msg, controls);

  rowBtn.addEventListener('click', () => {
    const nowOpen = !expanded.has(s.id);
    if (nowOpen) expanded.add(s.id); else expanded.delete(s.id);
    group.classList.toggle('is-open', nowOpen);
    rowBtn.setAttribute('aria-expanded', String(nowOpen));
    detail.hidden = !nowOpen;
  });

  group.append(rowBtn, detail);
  return group;
}

// ─── Startup ─────────────────────────────────────────────────────────────────
// Runs last, after every declaration above is initialized. Dashboard controls are
// wired even while app-view is hidden (the elements exist in the DOM regardless).

// Read-only accessor for copilot.js — returns a shallow copy so the assistant
// can never mutate submissionsCache; no write path is exposed.
window.__getSubmissions = () => submissionsCache.slice();

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
  if (latestVisitorMetrics) { updateVisitorCharts(latestVisitorMetrics); renderVisitorMetrics(latestMetrics, latestVisitorMetrics); }
});

el('dash-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.navlink');
  if (!btn || !btn.dataset.view) return;   // Flux (and other non-view navlinks) handle their own click
  el('dash-nav').querySelectorAll('.navlink[data-view]').forEach((n) => n.classList.toggle('is-active', n === btn));
  setDashView(btn.dataset.view);
});

wireTheme();
wireSidebar();

// Re-render the dynamic dashboard (table, status labels, charts, KPI notes) when
// the language changes; static chrome is handled by i18n's TreeWalker.
onLangChange(() => { if (!el('app-view').hidden && latestMetrics) renderDashboard(); });

if (DEMO) {
  startDemo();
} else {
  setPersistence(auth, browserSessionPersistence)
    .catch((err) => console.error('persistence:', err?.code ?? 'unknown'));

  wireAuthControls();

  onAuthStateChanged(auth, (user) => {
    if (unsubscribeSubmissions) { unsubscribeSubmissions(); unsubscribeSubmissions = null; }
    submissionsCache = [];
    analyticsCache = [];
    destroyCharts();
    currentUser = user;
    if (!user) { showView('signin'); return; }
    evaluateAccess(user);
  });
}
