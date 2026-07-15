/*
 * Portfolio filter + accessible lightbox.
 * Dependency-free, self-contained. Touches only #work / #lightbox elements —
 * never any element owned by main.js (nav, carousel, contact form).
 */
(function () {
  'use strict';

  const chips    = Array.from(document.querySelectorAll('.filter__chip'));
  const items    = Array.from(document.querySelectorAll('.work__item'));
  const lightbox = document.getElementById('lightbox');
  if (!items.length || !lightbox) return;

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
        item.hidden = !(filter === 'all' || item.dataset.category === filter);
      });
    });
  });

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
