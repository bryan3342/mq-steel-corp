// Pure, dependency-free PII redaction. Deterministic → unit-testable.
// EMAIL: tolerates a single optional space on either side of "@" (e.g. "bob @acme.com").
const EMAIL = /\b[^@\s]+\s?@\s?[^@\s]+\.[^@\s]+\b/g;
// PHONE: shaped like an actual phone number (area/exchange/line with common
// separators, parenthesized area code with optional trailing space, optional
// leading country code) OR a formatted 7-digit number OR a bare 10/11-digit run.
// Deliberately NOT "any 8+ digit run" — that missed parenthesized area codes
// and over-matched unrelated digit sequences.
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]?\d{4}\b|\b\d{3}[\s.-]\d{4}\b|\b1?\d{10}\b/g;

export function scrubText(str) {
  if (!str) return '';
  return String(str).replace(EMAIL, '[email removed]').replace(PHONE, '[phone removed]');
}

// Returns a redacted COPY safe to send to the model / store in companyMemory.
// Drops personal identifiers; keeps business fields.
export function redact(sub) {
  sub = sub || {};
  return {
    company: sub.company || '',
    service: scrubText(sub.service || ''),
    status: sub.status || 'new',
    submittedAt: sub.submittedAt ?? null,
    // name/email intentionally omitted
  };
}
