import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { EMAILJS } from './email-config.js';

/* Mobile Menu */
const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('navbar__mobile-menu--open');
    hamburger.classList.toggle('navbar__hamburger--active');
    hamburger.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('navbar__mobile-menu--open');
      hamburger.classList.remove('navbar__hamburger--active');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });
}

/* Navbar Scroll Effect */
const navbar = document.getElementById('navbar');
const SCROLL_THRESHOLD = 100;

function handleNavbarScroll() {
  if (window.scrollY > SCROLL_THRESHOLD) {
    navbar.classList.add('navbar--scrolled');
  } else {
    navbar.classList.remove('navbar--scrolled');
  }
}

if (navbar) {
  window.addEventListener('scroll', handleNavbarScroll, { passive: true });
  handleNavbarScroll();
}

/* Hero Carousel */
const carouselEl = document.getElementById('projectCarousel');

if (carouselEl && typeof Splide !== 'undefined') {
  new Splide('#projectCarousel', {
    type        : 'fade',
    rewind      : true,
    perPage     : 1,
    perMove     : 1,
    pagination  : false,
    arrows      : false,
    autoplay    : true,
    interval    : 5000,
    pauseOnHover: false,
    pauseOnFocus: false,
    speed       : 1000,
    easing      : 'ease',
  }).mount();
}

/* Smooth Scroll */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href');
    if (targetId === '#') return;

    const targetEl = document.querySelector(targetId);
    if (!targetEl) return;

    e.preventDefault();

    const navbarHeight = document.getElementById('navbar')?.offsetHeight || 70;
    const targetPosition = targetEl.getBoundingClientRect().top + window.scrollY - navbarHeight;

    window.scrollTo({
      top: targetPosition,
      behavior: 'smooth',
    });
  });
});

/* Contact Form Submission + Email Notifications */
const contactForm = document.getElementById('contactForm');

const CONTACT_ERROR_MSG = 'Something went wrong. Try again.';
const BUTTON_RESET_MS = 3000;

// A placeholder value (e.g. 'YOUR_…') means that EmailJS id hasn't been configured yet.
const isConfigured = (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('YOUR_');

/*
 * Notify the team (and auto-reply to the sender) via EmailJS — client-side, no backend.
 * Best-effort: the Firestore write is the source of truth, so a failed send never loses
 * the submission. Each job runs through its OWN EmailJS service so the "From" is the right
 * account (internal → adminmqsteel@gmail.com, auto-reply → mqsteelco@gmail.com). Skips
 * cleanly until EmailJS is configured. Never throws — resolves after all sends settle.
 */
async function sendRequestEmails(lead) {
  if (!isConfigured(EMAILJS.publicKey)) return;

  const jobs = [
    { label: 'internal',   cfg: EMAILJS.internal },
    { label: 'auto-reply', cfg: EMAILJS.autoReply },
  ].filter(({ cfg }) => cfg && isConfigured(cfg.serviceId) && isConfigured(cfg.templateId));

  if (!jobs.length) return;

  const templateParams = {
    name:         lead.name,
    email:        lead.email,
    company:      lead.company || '—',
    service:      lead.service,
    submitted_at: new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short',
    }),
  };

  const send = ({ serviceId, templateId }) =>
    fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:      serviceId,
        template_id:     templateId,
        user_id:         EMAILJS.publicKey,
        template_params: templateParams,
      }),
    }).then((res) => {
      if (!res.ok) throw new Error(`EmailJS ${res.status}`);
    });

  const results = await Promise.allSettled(jobs.map(({ cfg }) => send(cfg)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Notification email (${jobs[i].label}) failed:`, r.reason?.message ?? 'unknown');
    }
  });
}

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    if (!submitBtn) return;
    const originalText = submitBtn.textContent;

    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;
    submitBtn.classList.add('btn--loading');

    try {
      const formData = new FormData(contactForm);
      // The lead is what the email templates need; the Firestore document adds the
      // server timestamp + status separately (kept distinct from the email payload).
      const lead = {
        name:    formData.get('name'),
        email:   formData.get('email'),
        company: formData.get('company') || '',
        service: formData.get('service'),
      };

      await addDoc(collection(db, 'submissions'), {
        ...lead,
        submittedAt: serverTimestamp(),
        status:      'new',
      });

      // Success: remove the input fields and show the completion message.
      contactForm.hidden = true;
      const subtitle = contactForm.parentElement?.querySelector('.section__subtitle');
      if (subtitle) subtitle.hidden = true;
      const successEl = document.getElementById('contactSuccess');
      if (successEl) successEl.hidden = false;

      // Best-effort notification — self-contained (never throws); the submission is saved.
      await sendRequestEmails(lead);

    } catch (error) {
      console.error('Form submission failed:', error?.code ?? error?.message ?? error);
      submitBtn.textContent = CONTACT_ERROR_MSG;

      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn--loading');
      }, BUTTON_RESET_MS);
    }
  });
}
