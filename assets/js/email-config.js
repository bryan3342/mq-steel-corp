// ─── EmailJS configuration ──────────────────────────────────────────────────
// These are PUBLIC identifiers — safe to expose in client code, exactly like the
// Firebase web config. Sending is protected by locking the EmailJS account to this
// site's domain (and, recommended, EmailJS's own reCAPTCHA on each template).
//
// One-time setup at https://dashboard.emailjs.com:
//   1. Add an email service (e.g. Gmail / your SMTP)              → serviceId
//   2. Create two templates:
//        • Internal notification — set the template's "To" to your
//          team's sendee list (edit recipients here anytime, no redeploy) → templateInternal
//        • Auto-reply — set the template's "To" to {{email}}             → templateAutoReply
//      Both templates can use these variables: {{name}} {{email}}
//      {{company}} {{service}} {{submitted_at}}
//   3. Account → General → Public Key                            → publicKey
//   4. Account → Security → enable "Allow requests only from allowed domains"
//      and add mq-steel-corp.web.app (+ any custom domain).
//
// Until the placeholders below are replaced, the form still works — email sending
// is simply skipped.
export const EMAILJS = {
  publicKey:         'YOUR_EMAILJS_PUBLIC_KEY',
  serviceId:         'YOUR_EMAILJS_SERVICE_ID',
  templateInternal:  'YOUR_INTERNAL_TEMPLATE_ID',
  templateAutoReply: 'YOUR_AUTOREPLY_TEMPLATE_ID',
};
