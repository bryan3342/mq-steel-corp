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

/*
 * Notify the team (and auto-reply to the sender) via EmailJS — client-side, no backend.
 * Best-effort: the Firestore write above is the source of truth, so a failed send never
 * loses the submission (it stays visible in the console). Skips cleanly until EmailJS is
 * configured in assets/js/email-config.js. Never throws — resolves after all sends settle.
 */
async function sendRequestEmails(submission) {
  const templates = [
    ['internal',   EMAILJS.templateInternal],
    ['auto-reply', EMAILJS.templateAutoReply],
  ].filter(([, id]) => id && !id.startsWith('YOUR_'));

  if (!EMAILJS.publicKey || EMAILJS.publicKey.startsWith('YOUR_') || !templates.length) return;

  const templateParams = {
    name:         submission.name,
    email:        submission.email,
    company:      submission.company || '—',
    service:      submission.service,
    submitted_at: new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short',
    }),
  };

  const send = (templateId) =>
    fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:      EMAILJS.serviceId,
        template_id:     templateId,
        user_id:         EMAILJS.publicKey,
        template_params: templateParams,
      }),
    }).then((res) => {
      if (!res.ok) throw new Error(`EmailJS ${res.status}`);
    });

  const results = await Promise.allSettled(templates.map(([, id]) => send(id)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Notification email (${templates[i][0]}) failed:`, r.reason?.message ?? 'unknown');
    }
  });
}

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;
    submitBtn.classList.add('btn--loading');

    try {
      const formData = new FormData(contactForm);
      const submission = {
        name:        formData.get('name'),
        email:       formData.get('email'),
        company:     formData.get('company') || '',
        service:     formData.get('service'),
        submittedAt: serverTimestamp(),
        status:      'new',
      };

      await addDoc(collection(db, 'submissions'), submission);

      submitBtn.textContent = 'Message Sent!';
      contactForm.reset();

      // Best-effort notification — never let an email failure undo the confirmed save.
      try {
        await sendRequestEmails(submission);
      } catch (notifyError) {
        console.error('Notification failed:', notifyError?.message ?? 'unknown');
      }

      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn--loading');
      }, 3000);

    } catch (error) {
      console.error('Form submission failed:', error.code ?? 'unknown');
      submitBtn.textContent = 'Something went wrong. Try again.';

      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn--loading');
      }, 3000);
    }
  });
}
