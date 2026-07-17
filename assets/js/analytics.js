// Cookieless, privacy-friendly visit counting.
//
// Increments per-day AGGREGATE counters in Firestore (analytics_daily/{YYYY-MM-DD} =
// { views, sessions }). No cookies, no IP, no identifiers — just counts. Reuses the
// App Check-guarded `db`; the Firestore rules lock each write to a +1 increment of a
// two-integer document, so nothing else can ever be stored here.
//
// Entirely fire-and-forget: every failure path (offline, rule reject, App Check, blocked
// storage) is swallowed so this can NEVER break the page or the contact form. Disclosed
// in the privacy policy (§2 "Information We Collect" and §7 "Cookies").
import { db } from './firebase-config.js';
import { doc, setDoc, increment } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

const SESSION_KEY = 'mq_sess';           // sessionStorage: per-tab de-dup flag (not a cookie)
const OPTOUT_KEY  = 'mq_analytics_optout'; // localStorage: set to any value to opt a browser out

export function trackVisit() {
  try {
    // Exclusions — all best-effort, all fail toward "don't count".
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return; // dev
    if (navigator.webdriver) return;                                                    // automation
    if (/bot|crawl|spider|slurp|headless/i.test(navigator.userAgent || '')) return;     // obvious bots
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;         // DNT / GPC
    try { if (localStorage.getItem(OPTOUT_KEY)) return; } catch { /* storage blocked */ }

    // Session de-dup: one "session" per tab session (sessionStorage clears on tab close).
    // Holds a constant flag, never an identifier, never sent anywhere.
    let isNewSession = true;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) isNewSession = false;
      else sessionStorage.setItem(SESSION_KEY, '1');
    } catch { /* private mode → count as a session rather than under-count a real human */ }

    // Business-tz day id, matching the admin dashboard's bucketing + the email locale.
    const id = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

    // Increment on a missing field starts from 0, so the day's first hit CREATES the doc.
    setDoc(
      doc(db, 'analytics_daily', id),
      { views: increment(1), sessions: increment(isNewSession ? 1 : 0) },
      { merge: true },
    ).catch(() => { /* offline / rules / App Check — never surface to the user */ });
  } catch { /* absolutely never throw into the page */ }
}
