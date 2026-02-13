/* ===========================================================
   main.js — MQ Steel Corp
   All interactive behavior for the single-page site.
   Uses ES module imports (type="module" in index.html).
   =========================================================== */

import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

/* ---------------------------------------------------------
   1. MOBILE MENU TOGGLE
   Hamburger button opens/closes the slide-in mobile menu.
   Updates aria-expanded for screen readers and locks body
   scroll while the menu is open.
   --------------------------------------------------------- */
const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('navbar__mobile-menu--open');
    hamburger.classList.toggle('navbar__hamburger--active');
    hamburger.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close menu when any nav link inside it is clicked
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('navbar__mobile-menu--open');
      hamburger.classList.remove('navbar__hamburger--active');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });
}


/* ---------------------------------------------------------
   2. SCROLL-BASED NAVBAR STYLING
   Adds a shadow and semi-transparent background to the
   navbar after the user scrolls past 100px. Uses passive
   listener for scroll performance.
   --------------------------------------------------------- */
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
  handleNavbarScroll(); // run once on load in case page loads scrolled
}


/* ---------------------------------------------------------
   3. SPLIDE HERO BACKGROUND CAROUSEL
   Full-screen crossfade carousel behind the hero text.
   1 slide at a time, no controls, auto-rotates every 5s.
   Splide is loaded as a regular script, available as a global.
   --------------------------------------------------------- */
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


/* ---------------------------------------------------------
   4. SMOOTH SCROLL WITH NAVBAR OFFSET
   CSS scroll-padding-top handles basic anchor scrolling,
   but this JS provides a reliable offset calculation for
   all browsers when clicking any anchor link.
   --------------------------------------------------------- */
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


/* ---------------------------------------------------------
   5. CONTACT FORM — FIRESTORE SUBMISSION
   Submits work order data to the Firebase Firestore
   "submissions" collection. Adds a server timestamp and
   "new" status for tracking. Shows loading/success/error
   states on the submit button.
   --------------------------------------------------------- */
const contactForm = document.getElementById('contactForm');

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    // Loading state
    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';

    try {
      // Build document from form fields
      const formData = new FormData(contactForm);
      const submission = {
        name:        formData.get('name'),
        email:       formData.get('email'),
        company:     formData.get('company') || '',
        service:     formData.get('service'),
        submittedAt: serverTimestamp(),
        status:      'new',
      };

      // Write to Firestore "submissions" collection
      await addDoc(collection(db, 'submissions'), submission);

      // Success feedback
      submitBtn.textContent = 'Message Sent!';
      contactForm.reset();

      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      }, 3000);

    } catch (error) {
      console.error('Form submission error:', error);

      // Error feedback
      submitBtn.textContent = 'Something went wrong. Try again.';

      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      }, 3000);
    }
  });
}
