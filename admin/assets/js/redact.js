// Pure, dependency-free PII redaction. Deterministic → unit-testable.
const EMAIL = /\b[^@\s]+@[^@\s]+\.[^@\s]+\b/g;
const PHONE = /(?:\+?\d[\s().-]?){7,}\d/g;

export function scrubText(str) {
  if (!str) return '';
  return String(str).replace(EMAIL, '[email removed]').replace(PHONE, '[phone removed]');
}

// Returns a redacted COPY safe to send to the model / store in companyMemory.
// Drops personal identifiers; keeps business fields.
export function redact(sub = {}) {
  return {
    company: sub.company || '',
    service: scrubText(sub.service || ''),
    status: sub.status || 'new',
    submittedAt: sub.submittedAt ?? null,
    // name/email intentionally omitted
  };
}
