/*
 * Portfolio filter + accessible lightbox + 3D reveal/tilt.
 * Dependency-free, self-contained. Touches only #work / #lightbox elements —
 * never any element owned by main.js (nav, carousel, contact form).
 * All motion is GPU-composited (transform/opacity) and respects reduced-motion.
 */
(function () {
  'use strict';

  const grid     = document.querySelector('.work__grid');
  const chips    = Array.from(document.querySelectorAll('.filter__chip'));
  const items    = Array.from(document.querySelectorAll('.work__item'));
  const lightbox = document.getElementById('lightbox');
  if (!items.length || !lightbox) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const lbImg    = lightbox.querySelector('.lightbox__img');
  const btnClose = lightbox.querySelector('.lightbox__close');
  const btnPrev  = lightbox.querySelector('.lightbox__nav--prev');
  const btnNext  = lightbox.querySelector('.lightbox__nav--next');

  /* ---------- Filtering ---------- */
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const filter = chip.dataset.filter;
      chips.forEach((c) => {
        const active = c === chip;
        c.classList.toggle('filter__chip--active', active);
        c.setAttribute('aria-pressed', String(active));
      });
      items.forEach((item) => {
        const show = filter === 'all' || item.dataset.category === filter;
        item.hidden = !show;
        // Ensure a card filtered back into view is never left in the pre-reveal state.
        if (show) item.classList.add('is-visible');
      });
    });
  });

  /* ---------- 3D scroll reveal ---------- */
  if (grid) {
    grid.classList.add('js-reveal');
    if (prefersReduced || !('IntersectionObserver' in window)) {
      items.forEach((i) => i.classList.add('is-visible'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
      items.forEach((i) => io.observe(i));
    }
  }

  /* ---------- 3D hover tilt (fine-pointer devices only) ---------- */
  const canTilt = !prefersReduced &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (canTilt) {
    const MAX = 6; // degrees
    items.forEach((item) => {
      const btn = item.querySelector('.work__btn');
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;   // -0.5 .. 0.5
        const py = (e.clientY - r.top) / r.height - 0.5;
        btn.style.setProperty('--rx', (px * MAX * 2).toFixed(2) + 'deg');   // rotateY
        btn.style.setProperty('--ry', (-py * MAX * 2).toFixed(2) + 'deg');  // rotateX
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.setProperty('--rx', '0deg');
        btn.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ---------- Lightbox ---------- */
  let current = -1;          // index into the currently-visible items
  let lastFocused = null;

  const visibleItems = () => items.filter((i) => !i.hidden);

  function render(item) {
    const btn = item.querySelector('.work__btn');
    lbImg.src = btn.dataset.full;
    lbImg.alt = btn.dataset.alt || '';
  }

  function openAt(item) {
    const vis = visibleItems();
    current = vis.indexOf(item);
    if (current === -1) return;
    render(vis[current]);
    lastFocused = document.activeElement;
    lightbox.classList.add('lightbox--open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    btnClose.focus();
    document.addEventListener('keydown', onKeydown);
  }

  function step(delta) {
    const vis = visibleItems();
    if (!vis.length) return;
    current = (current + delta + vis.length) % vis.length;
    render(vis[current]);
  }

  function close() {
    lightbox.classList.remove('lightbox--open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
    lbImg.src = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  function onKeydown(e) {
    switch (e.key) {
      case 'Escape':     close(); break;
      case 'ArrowRight': step(1); break;
      case 'ArrowLeft':  step(-1); break;
      case 'Tab': {
        // Focus trap across the three controls.
        const focusables = [btnClose, btnPrev, btnNext];
        const idx = focusables.indexOf(document.activeElement);
        e.preventDefault();
        const nextIdx = e.shiftKey
          ? (idx - 1 + focusables.length) % focusables.length
          : (idx + 1) % focusables.length;
        focusables[nextIdx].focus();
        break;
      }
      default: break;
    }
  }

  items.forEach((item) => {
    item.querySelector('.work__btn').addEventListener('click', () => openAt(item));
  });
  btnClose.addEventListener('click', close);
  btnPrev.addEventListener('click', () => step(-1));
  btnNext.addEventListener('click', () => step(1));
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
})();
