/* ===========================================================
   main.js — MQ Steel Corp
   All interactive behavior for the single-page site.
   =========================================================== */

document.addEventListener('DOMContentLoaded', () => {

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
     3. SPLIDE CAROUSEL INITIALIZATION
     Configures the project gallery carousel: infinite loop,
     3 slides on desktop / 2 on tablet / 1 on mobile,
     autoplay every 4 seconds, pauses on hover/focus.
     --------------------------------------------------------- */
  const carouselEl = document.getElementById('projectCarousel');

  if (carouselEl && typeof Splide !== 'undefined') {
    new Splide('#projectCarousel', {
      type       : 'loop',
      perPage    : 3,
      perMove    : 1,
      gap        : '1.5rem',
      pagination : true,
      arrows     : true,
      autoplay   : true,
      interval   : 4000,
      pauseOnHover: true,
      pauseOnFocus: true,
      speed      : 600,
      easing     : 'ease',
      breakpoints: {
        1024: { perPage: 2 },
        640:  { perPage: 1, arrows: false },
      },
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
     5. CONTACT FORM PLACEHOLDER HANDLER
     Prevents default form submission (since action="#"),
     logs data to console, and shows a brief "Message Sent!"
     confirmation. Replace with real backend (Formspree, etc.)
     in a future phase.
     --------------------------------------------------------- */
  const contactForm = document.getElementById('contactForm');

  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const formData = new FormData(contactForm);
      const data = Object.fromEntries(formData.entries());
      console.log('Form submitted:', data);

      // Visual feedback on submit button
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Message Sent!';
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.7';

      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        contactForm.reset();
      }, 3000);
    });
  }

});
