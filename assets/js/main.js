import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

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

/* Contact Form Submission */
const contactForm = document.getElementById('contactForm');

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';

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

      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      }, 3000);

    } catch (error) {
      console.error('Form submission error:', error);
      submitBtn.textContent = 'Something went wrong. Try again.';

      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      }, 3000);
    }
  });
}
