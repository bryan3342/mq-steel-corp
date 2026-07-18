// Lightweight i18n for the admin console. ONE dictionary (i18n-es.js) keyed by
// the exact English source string → Spanish, shared by both paths:
//  • static HTML is translated by a TreeWalker (no per-element tagging needed),
//    skipping containers marked [data-i18n-skip] that JS re-renders itself;
//  • JS-generated strings call t(englishSource).
// The choice is persisted in localStorage and re-applied on load. Toggle button
// is #lang-toggle in the app bar.
import { ES } from './i18n-es.js';

const LANG_KEY = 'mq_admin_lang';
const SUPPORTED = ['en', 'es'];
const ATTRS = ['placeholder', 'aria-label', 'title'];

let current = 'en';
try { const s = localStorage.getItem(LANG_KEY); if (SUPPORTED.includes(s)) current = s; } catch { /* storage blocked */ }

export function getLang() { return current; }

// Translate an English UI string to the current language (identity for English
// or unknown keys). Use this for every JS-generated user-facing string.
export function t(s) {
  if (current === 'es' && s != null && ES[s] !== undefined) return ES[s];
  return s;
}

export function onLangChange(cb) {
  document.addEventListener('langchange', (e) => cb(e.detail.lang));
}

// Originals captured on first touch so we can restore English when toggling back.
const ORIG_TEXT = new WeakMap();
const ORIG_ATTR = new WeakMap();

function skip(node) {
  const elem = node.nodeType === 1 ? node : node.parentElement;
  return !elem || elem.closest('[data-i18n-skip]') != null;
}

function translateTextNode(node) {
  const original = ORIG_TEXT.has(node) ? ORIG_TEXT.get(node) : node.nodeValue;
  const key = original.trim();
  if (!key) return;
  if (!ORIG_TEXT.has(node)) ORIG_TEXT.set(node, original);
  node.nodeValue = (current === 'es' && ES[key] !== undefined)
    ? original.replace(key, ES[key])
    : original;
}

function translateAttrs(elem) {
  let store = ORIG_ATTR.get(elem) || null;
  for (const a of ATTRS) {
    if (!elem.hasAttribute(a)) continue;
    if (!store) store = {};
    const original = store[a] !== undefined ? store[a] : elem.getAttribute(a);
    if (store[a] === undefined) store[a] = original;
    const key = original.trim();
    elem.setAttribute(a, current === 'es' && ES[key] !== undefined ? ES[key] : original);
  }
  if (store) ORIG_ATTR.set(elem, store);
}

// Translate all static text nodes + relevant attributes under `root`.
export function translateTree(root = document.body) {
  if (!root) return;
  root.querySelectorAll('[placeholder], [aria-label], [title]').forEach((el) => {
    if (!el.closest('[data-i18n-skip]')) translateAttrs(el);
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = n.parentNode;
      if (!p || p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE') return NodeFilter.FILTER_REJECT;
      return skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  nodes.forEach(translateTextNode);
}

function updateToggle() {
  const btn = document.getElementById('lang-toggle');
  if (!btn) return;
  const code = btn.querySelector('.lang-toggle__code');
  if (code) code.textContent = current.toUpperCase();
  btn.setAttribute('aria-label', current === 'es' ? 'Cambiar idioma a inglés' : 'Change language to Spanish');
  btn.setAttribute('aria-pressed', String(current === 'es'));
}

export function setLang(lang) {
  current = SUPPORTED.includes(lang) ? lang : 'en';
  try { localStorage.setItem(LANG_KEY, current); } catch { /* storage blocked */ }
  document.documentElement.lang = current;
  translateTree(document.body);
  updateToggle();
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: current } }));
}

function init() {
  document.documentElement.lang = current;
  document.getElementById('lang-toggle')?.addEventListener('click', () => setLang(current === 'es' ? 'en' : 'es'));
  if (current !== 'en') translateTree(document.body);   // apply saved language
  updateToggle();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
