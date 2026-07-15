import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword, sendEmailVerification, signOut, onAuthStateChanged,
  setPersistence, browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const STATUSES = ['new', 'contacted', 'closed'];
const el = (id) => document.getElementById(id);

// IMPORTANT: every value from a submission is written with `textContent` (never
// innerHTML) — submissions are stored raw from the public form, so this is the
// stored-XSS guard. Do not introduce innerHTML with submission data.

// ─── Demo mode ────────────────────────────────────────────────────────────────
// Localhost-only preview with sample data — no Firebase/Auth. Requires BOTH running on
// localhost AND `?demo=1`, so it can never activate on the deployed site.
function isDemoMode() {
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  return local && new URLSearchParams(location.search).has('demo');
}
const DEMO = isDemoMode();

const DEMO_SUBMISSIONS = [
  { id: 'd1', name: 'Jane Contractor', email: 'jane@ironworks.example', company: 'Ironworks LLC',
    service: 'Structural steel fabrication for a 3-story mixed-use building — approx. 40 tons, delivery targeted for Q4.',
    status: 'new', submittedAt: { toDate: () => new Date('2026-07-14T10:20:00') } },
  { id: 'd2', name: 'Marcus Reed', email: 'm.reed@example.com', company: '',
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
  app:     el('app-view'),
};

let unsubscribeSubmissions = null;
let submissionsCache = [];
let currentUser = null;

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

// ─── Startup ─────────────────────────────────────────────────────────────────
el('search-input').addEventListener('input', renderRequests);
el('status-filter').addEventListener('change', renderRequests);

if (DEMO) {
  startDemo();
} else {
  // Per-session auth: survives refresh within a session; a new visit signs in again.
  setPersistence(auth, browserSessionPersistence)
    .catch((err) => console.error('persistence:', err?.code ?? 'unknown'));

  wireAuthControls();

  onAuthStateChanged(auth, (user) => {
    if (unsubscribeSubmissions) { unsubscribeSubmissions(); unsubscribeSubmissions = null; }
    submissionsCache = [];
    currentUser = user;
    if (!user) { showView('signin'); return; }
    evaluateAccess(user);
  });
}

function wireAuthControls() {
  document.querySelectorAll('[data-signout]').forEach((b) =>
    b.addEventListener('click', () => signOut(auth)));

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
}

function setFormBusy(busy) {
  el('signin-btn').disabled = busy;
  el('email').disabled = busy;
  el('password').disabled = busy;
}

// ─── Access routing ──────────────────────────────────────────────────────────
async function evaluateAccess(user) {
  showView('loading');

  let allowlisted = false;
  try {
    allowlisted = (await getDoc(doc(db, 'admins', normalizeEmail(user.email)))).exists();
  } catch (err) {
    console.error('admin-check:', err?.code ?? 'unknown');
  }

  if (!allowlisted) {
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
  renderRequests();
}

// ─── Requests (loaded only after the admin check passes) ─────────────────────
function subscribeSubmissions() {
  const q = query(collection(db, 'submissions'), orderBy('submittedAt', 'desc'));
  unsubscribeSubmissions = onSnapshot(
    q,
    (snap) => {
      submissionsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderRequests();
    },
    (err) => {
      console.error('submissions:', err?.code ?? 'unknown');
      toast('Could not load requests.', true);
    },
  );
}

function renderRequests() {
  const term = el('search-input').value.trim().toLowerCase();
  const statusFilter = el('status-filter').value;

  const rows = submissionsCache.filter((s) => {
    if (statusFilter !== 'all' && (s.status ?? 'new') !== statusFilter) return false;
    if (!term) return true;
    return [s.name, s.email, s.company, s.service]
      .some((v) => (v ?? '').toLowerCase().includes(term));
  });

  el('requests-count').textContent =
    `${rows.length}${rows.length !== submissionsCache.length ? ` of ${submissionsCache.length}` : ''}`;

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
