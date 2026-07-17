import { db } from './firebase-config.js';
import {
  collection, getDocs, query, where, doc, setDoc, addDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';
import { redact } from './redact.js';

const COL = 'companyMemory';

export async function loadMemory() {
  const snap = await getDocs(collection(db, COL));
  const out = { fact: [], insight: [], pattern: [], request: [] };
  snap.forEach((d) => { const m = d.data(); if (out[m.type]) out[m.type].push({ id: d.id, ...m }); });
  return out;
}

// Idempotent: one redacted `request` doc per submission (id = req_<submissionId>).
export async function upsertRequestEntries(subs, existingRequests) {
  const have = new Set(existingRequests.map((r) => r.refId));
  const todo = subs.filter((s) => s.id && !have.has(s.id));
  for (const s of todo) {
    const r = redact(s);
    await setDoc(doc(db, COL, `req_${s.id}`), {
      type: 'request', refId: s.id, company: r.company, serviceSummary: r.service,
      status: r.status, submittedAt: s.submittedAt ?? serverTimestamp(),
    });
  }
  return todo.length;
}

export const saveFact    = (text, by) => addDoc(collection(db, COL), { type: 'fact', text, createdBy: by, createdAt: serverTimestamp() });
export const saveInsight = (text, by) => addDoc(collection(db, COL), { type: 'insight', text, confirmedBy: by, createdAt: serverTimestamp() });
export const savePatterns = (list) => Promise.all(list.map((p) =>
  addDoc(collection(db, COL), { type: 'pattern', text: p.text, generatedAt: serverTimestamp() })));
