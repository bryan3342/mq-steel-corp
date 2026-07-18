// Documents — deterministic invoice/fax generator. Fill a form → review a
// textContent-safe preview → download a .docx built by filling a template
// (assets/templates/*.docx) with docxtemplater + pizzip (vendored, pure-JS).
// All money math is done in invoice-calc.js; the template only ever receives
// pre-formatted strings (never in-template math → stays CSP-safe, no eval).
import { db, auth, appCheck } from './firebase-config.js';
import { doc, collection, runTransaction, addDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app-check.js';
import { parseAmountToCents, parseRatePercent, computeInvoice, formatUSD } from './invoice-calc.js';
import { t, getLang, onLangChange } from './i18n.js';

const el = (id) => document.getElementById(id);
const WORKER_URL = 'https://mq-steel-assistant.bryanmejiaeducation.workers.dev/chat';
const INVOICE_PREFIX = 'MQ-';
const INVOICE_PAD = 4;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let docType = 'invoice';

function status(msg, kind = '') {
  const s = el('doc-status');
  if (!s) return;
  s.textContent = t(msg);   // literal-key messages auto-translate; pre-built strings pass through
  s.className = 'doc-status' + (kind ? ` is-${kind}` : '');
}

// Local YYYY-MM-DD → "July 18, 2026" without any timezone shift.
function prettyDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
function todayIso() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// ── Line items ──────────────────────────────────────────────────────────────
function addItemRow(description = '', amount = '') {
  const wrap = el('doc-items');
  if (!wrap) return;
  const row = document.createElement('div');
  row.className = 'doc-item';
  const desc = document.createElement('input');
  desc.className = 'input'; desc.type = 'text'; desc.placeholder = t('Item description');
  desc.value = description; desc.dataset.role = 'item-desc';
  const amt = document.createElement('input');
  amt.className = 'input'; amt.type = 'text'; amt.inputMode = 'decimal'; amt.placeholder = '0.00';
  amt.value = amount; amt.dataset.role = 'item-amount';
  const rm = document.createElement('button');
  rm.type = 'button'; rm.className = 'doc-item__remove'; rm.setAttribute('aria-label', t('Remove item')); rm.textContent = '×';
  rm.addEventListener('click', () => { row.remove(); renderPreview(); });
  row.append(desc, amt, rm);
  wrap.append(row);
}

function readLineItems() {
  return [...el('doc-items').querySelectorAll('.doc-item')]
    .map((r) => ({
      item: r.querySelector('[data-role=item-desc]').value.trim(),
      amountCents: parseAmountToCents(r.querySelector('[data-role=item-amount]').value),
    }))
    .filter((it) => it.item || it.amountCents);   // drop fully-empty rows
}

// ── Read form → structured data ─────────────────────────────────────────────
function readInvoice() {
  const items = readLineItems();
  const taxRatePercent = parseRatePercent(el('doc-taxRate').value);
  const totals = computeInvoice({ lineItems: items, taxRatePercent });
  return {
    invoiceNumber: el('doc-invoiceNumber').value.trim(),
    invoiceDate: prettyDate(el('doc-invoiceDate').value),
    billToName: el('doc-billToName').value.trim(),
    billToAddress: el('doc-billToAddress').value.trim(),
    taskName: el('doc-taskName').value.trim(),
    description: el('doc-description').value.trim(),
    notes: el('doc-notes').value.trim(),
    items, taxRatePercent, ...totals,
  };
}

function readFax() {
  return {
    to: el('fax-to').value.trim(),
    from: el('fax-from').value.trim(),
    faxNumber: el('fax-faxNumber').value.trim(),
    faxDate: prettyDate(el('fax-faxDate').value),
    re: el('fax-re').value.trim(),
    pages: el('fax-pages').value.trim(),
    message: el('fax-message').value.trim(),
  };
}

// ── Preview (built with createElement + textContent only — never innerHTML) ──
function line(cls, text) { const p = document.createElement('div'); if (cls) p.className = cls; p.textContent = text; return p; }
function kv(parent, label, value) {
  const r = document.createElement('div'); r.className = 'doc-preview__row';
  const l = document.createElement('span'); l.className = 'doc-preview__muted'; l.textContent = label;
  const v = document.createElement('span'); v.textContent = value;
  r.append(l, v); parent.append(r);
}

function renderPreview() {
  const box = el('doc-preview');
  if (!box) return;
  box.replaceChildren();
  if (docType === 'invoice') renderInvoicePreview(box, readInvoice());
  else renderFaxPreview(box, readFax());
}

function renderInvoicePreview(box, inv) {
  box.append(line('doc-preview__title', t('Invoice')));
  box.append(line('', `${t('Invoice #')}: ${inv.invoiceNumber || t('(auto)')}`));
  if (inv.invoiceDate) box.append(line('doc-preview__muted', inv.invoiceDate));
  if (inv.billToName || inv.billToAddress) {
    const sec = document.createElement('div'); sec.className = 'doc-preview__section';
    sec.append(line('doc-preview__strong', t('Bill to')));
    if (inv.billToName) sec.append(line('', inv.billToName));
    if (inv.billToAddress) sec.append(line('doc-preview__muted', inv.billToAddress));
    box.append(sec);
  }
  if (inv.taskName) box.append(line('doc-preview__strong', inv.taskName));
  if (inv.description) box.append(line('', inv.description));

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  const th1 = document.createElement('th'); th1.textContent = t('Description');
  const th2 = document.createElement('th'); th2.className = 'amt'; th2.textContent = t('Amount');
  htr.append(th1, th2); thead.append(htr); table.append(thead);
  const tbody = document.createElement('tbody');
  for (const it of inv.items) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = it.item || '—';
    const td2 = document.createElement('td'); td2.className = 'amt'; td2.textContent = formatUSD(it.amountCents);
    tr.append(td1, td2); tbody.append(tr);
  }
  table.append(tbody); box.append(table);

  const totals = document.createElement('div'); totals.className = 'doc-preview__totals';
  kv(totals, t('Subtotal'), formatUSD(inv.subtotalCents));
  kv(totals, `${t('Tax')} (${inv.taxRatePercent || 0}%)`, formatUSD(inv.taxCents));
  const totalRow = document.createElement('div'); totalRow.className = 'doc-preview__row doc-preview__strong';
  const tl = document.createElement('span'); tl.textContent = t('Total');
  const tv = document.createElement('span'); tv.textContent = formatUSD(inv.totalCents);
  totalRow.append(tl, tv); totals.append(totalRow); box.append(totals);

  if (inv.notes) {
    const n = document.createElement('div'); n.className = 'doc-preview__section';
    n.append(line('doc-preview__muted', inv.notes)); box.append(n);
  }
}

function renderFaxPreview(box, fax) {
  box.append(line('doc-preview__title', t('Fax')));
  kv(box, t('To'), fax.to || '—');
  kv(box, t('From'), fax.from || '—');
  kv(box, t('Fax'), fax.faxNumber || '—');
  if (fax.faxDate) kv(box, t('Date'), fax.faxDate);
  kv(box, t('Re'), fax.re || '—');
  kv(box, t('Pages'), fax.pages || '—');
  const msg = document.createElement('div'); msg.className = 'doc-preview__section'; msg.textContent = fax.message || '';
  box.append(msg);
}

// ── Template data (pre-formatted strings only) ──────────────────────────────
function invoiceTemplateData(inv, number) {
  return {
    invoiceNumber: number || inv.invoiceNumber || '',
    invoiceDate: inv.invoiceDate,
    billToName: inv.billToName,
    billToAddress: inv.billToAddress,
    taskName: inv.taskName,
    description: inv.description,
    lineItems: inv.items.map((it) => ({ item: it.item, amount: formatUSD(it.amountCents) })),
    subtotal: formatUSD(inv.subtotalCents),
    taxRate: `${inv.taxRatePercent || 0}%`,
    tax: formatUSD(inv.taxCents),
    total: formatUSD(inv.totalCents),
    notes: inv.notes,
  };
}
const faxTemplateData = (fax) => ({
  to: fax.to, from: fax.from, faxNumber: fax.faxNumber,
  faxDate: fax.faxDate, re: fax.re, pages: fax.pages, message: fax.message,
});

// ── Fill + download ─────────────────────────────────────────────────────────
async function fillTemplate(path, data) {
  if (!window.PizZip || !window.docxtemplater) throw new Error('Document libraries did not load.');
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${t('Could not load template')} (${res.status}).`);
  const zip = new window.PizZip(await res.arrayBuffer());
  const tpl = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  tpl.render(data);   // throws on malformed {tags}
  return tpl.getZip().generate({ type: 'blob', mimeType: DOCX_MIME });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Gap-free sequential invoice number via a Firestore transaction on counters/invoice.
async function nextInvoiceNumber() {
  const ref = doc(db, 'counters', 'invoice');
  const n = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = snap.exists() && Number.isInteger(snap.data().next) ? snap.data().next : 1;
    tx.set(ref, { next: next + 1 }, { merge: true });
    return next;
  });
  return INVOICE_PREFIX + String(n).padStart(INVOICE_PAD, '0');
}

// Immutable audit record (best-effort — never blocks the download).
async function logDocument(meta) {
  try {
    await addDoc(collection(db, 'documents'), {
      docType: meta.docType,
      invoiceNumber: meta.invoiceNumber || '',
      label: meta.label || '',
      totalCents: Number.isInteger(meta.totalCents) ? meta.totalCents : 0,
      generatedBy: auth.currentUser?.email || '(unknown)',
      generatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('document audit-log failed:', e?.message ?? e);
  }
}

async function generate() {
  const btn = el('doc-generate');
  btn.disabled = true;
  status('Generating…');
  try {
    if (docType === 'invoice') {
      const inv = readInvoice();
      if (!inv.items.length) { status('Add at least one line item with an amount.', 'error'); return; }
      let number = inv.invoiceNumber;
      if (!number) { number = await nextInvoiceNumber(); el('doc-invoiceNumber').value = number; }
      const blob = await fillTemplate('assets/templates/invoice.docx', invoiceTemplateData(inv, number));
      downloadBlob(blob, `Invoice-${number}.docx`);
      await logDocument({ docType: 'invoice', invoiceNumber: number, label: inv.taskName, totalCents: inv.totalCents });
      status(`${t('Generated')} ${number}.`, 'success');
      renderPreview();
    } else {
      const fax = readFax();
      if (!fax.to && !fax.message) { status('Add a recipient and a message.', 'error'); return; }
      const blob = await fillTemplate('assets/templates/fax.docx', faxTemplateData(fax));
      const slug = (fax.to || 'fax').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'fax';
      downloadBlob(blob, `Fax-${slug}.docx`);
      await logDocument({ docType: 'fax', invoiceNumber: '', label: fax.re, totalCents: 0 });
      status('Fax generated.', 'success');
    }
  } catch (e) {
    console.error('document generation error:', e);
    const templateErr = e?.properties?.errors?.length || /tag|unopened|unclosed|duplicate/i.test(e?.message || '');
    status(templateErr ? 'Template error — check the {placeholders} in the .docx.' : (e?.message || 'Could not generate the document.'), 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Draft with Flux (optional, description text only) ───────────────────────
async function authHeaders() {
  const idToken = await auth.currentUser.getIdToken();
  const ac = await getToken(appCheck, false);
  return { Authorization: `Bearer ${idToken}`, 'X-Firebase-AppCheck': ac.token, 'content-type': 'application/json' };
}

async function draftDescription() {
  const btn = el('doc-draft');
  const task = el('doc-taskName').value.trim();
  const note = el('doc-description').value.trim();
  if (!task && !note) { status('Add a task name or a short note for Flux to expand.', 'error'); return; }
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = t('Drafting…');
  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ mode: 'draft', question: `Task: ${task}\nNotes: ${note}`, lang: getLang() }),
    });
    if (!res.ok) throw new Error('draft request failed');
    const { text } = await res.json();
    if (text) { el('doc-description').value = text.trim(); renderPreview(); status('Drafted — review and edit before generating.', 'success'); }
  } catch (e) {
    console.error('draft error:', e);
    status('Could not draft right now.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

// ── Bill-to company suggestions from existing leads (read-only) ─────────────
function fillCompanies() {
  const dl = el('doc-companies');
  if (!dl) return;
  const subs = window.__getSubmissions?.() || [];
  const names = [...new Set(subs.map((s) => (s.company || '').trim()).filter(Boolean))].sort();
  dl.replaceChildren();
  for (const n of names) { const o = document.createElement('option'); o.value = n; dl.append(o); }
}

function setDocType(type) {
  docType = type;
  document.querySelectorAll('#doc-type .seg__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.doc === type));
  document.querySelectorAll('.doc-fields').forEach((g) => { g.hidden = g.dataset.fields !== type; });
  status('');
  renderPreview();
}

export function initDocuments() {
  const form = el('doc-form');
  if (!form) return;
  addItemRow();
  addItemRow();
  if (el('doc-invoiceDate')) el('doc-invoiceDate').value = todayIso();
  if (el('fax-faxDate')) el('fax-faxDate').value = todayIso();
  fillCompanies();
  renderPreview();

  el('doc-type')?.addEventListener('click', (e) => {
    const b = e.target.closest('.seg__btn');
    if (b) setDocType(b.dataset.doc);
  });
  el('doc-add-item')?.addEventListener('click', () => { addItemRow(); renderPreview(); });
  el('doc-draft')?.addEventListener('click', draftDescription);
  form.addEventListener('input', renderPreview);
  form.addEventListener('submit', (e) => { e.preventDefault(); generate(); });

  onLangChange(() => {
    renderPreview();
    document.querySelectorAll('#doc-items [data-role=item-desc]').forEach((i) => { i.placeholder = t('Item description'); });
    document.querySelectorAll('#doc-items .doc-item__remove').forEach((b) => b.setAttribute('aria-label', t('Remove item')));
  });
}

initDocuments();
