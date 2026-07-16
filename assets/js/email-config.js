// ─── EmailJS configuration ──────────────────────────────────────────────────
// PUBLIC identifiers — safe to expose in client code, exactly like the Firebase web
// config. Sending is protected by locking the EmailJS account to this site's domain
// (Account → Security → allowed domains: mq-steel-corp.web.app).
//
// Two services / two templates:
//   • internal  → sent through the adminmqsteel@gmail.com service; the template's To is
//     mqsteelco@gmail.com (the inquiries inbox) and Reply-To is {{email}} (the lead).
//   • autoReply → sent through the mqsteelco@gmail.com service; the template's To is
//     {{email}} (the submitter) and it shows as "MQ Steel Corp".
// Templates use: {{name}} {{email}} {{company}} {{service}} {{submitted_at}}
export const EMAILJS = {
  publicKey: 'SCvPKJbJEy-dE6sLG',

  // Internal notification → adminmqsteel@gmail.com service
  internal: {
    serviceId:  'service_kmxc7y5',
    templateId: 'template_c5l2qqv',
  },

  // Auto-reply to the submitter → mqsteelco@gmail.com service
  autoReply: {
    serviceId:  'service_n1gvcsp',
    templateId: 'template_58d0qqm',
  },
};
