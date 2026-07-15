# MQ Steel Corp Landing Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the single-page landing site into the image-forward "Modern Structural" look and add a Portfolio gallery, preserving 100% of existing functionality.

**Architecture:** Static site — no build step. Restructure `index.html` markup, rewrite `assets/css/styles.css` design system, add a new dependency-free `assets/js/portfolio.js` for the gallery filter + lightbox, and self-host freely-licensed images under `assets/images/`. The existing `assets/js/main.js` (mobile menu, navbar scroll, Splide hero carousel, smooth scroll, Firestore + EmailJS contact form) is **not modified** — only the DOM IDs/classes it depends on are preserved.

**Tech Stack:** HTML5, CSS (custom properties, grid/flex), vanilla ES modules, Splide 4.1.4 (already loaded via CDN), Google Fonts Oswald/Montserrat/Inter (unchanged).

## Global Constraints

- **Fonts unchanged:** Oswald (display), Montserrat (headings), Inter (body). Do not add or swap font families.
- **Do NOT modify** `assets/js/main.js`, `assets/js/email-config.js`, `assets/js/firebase-config.js`, `firebase.json`, `firestore.rules`, `.firebaserc`, the `.github/` workflows, `privacy.html`, or anything under `admin/`. A parallel session owns those and some have uncommitted work.
- **Preserve these DOM hooks exactly** (main.js depends on them): `#hamburger`, `#mobileMenu`, classes `navbar__mobile-menu--open` / `navbar__hamburger--active`; `#navbar` + class `navbar--scrolled`; `#projectCarousel` with `.splide` / `.splide__track` / `.splide__list` / `.splide__slide`; anchor IDs `#home`, `#about-company`, `#about`, `#contact`; `#contactForm` with inputs named `name` / `email` / `company` / `service` and its `button[type="submit"]`; `.grecaptcha-badge`.
- **New anchor** `#work` is added for the Portfolio section; all nav/footer/CTA links updated to match.
- **Commits stage explicit paths only** — never `git add -A` / `git add .`. Allowed paths: `index.html`, `assets/css/styles.css`, `assets/js/portfolio.js`, `assets/images/`, `docs/superpowers/`. This keeps the admin session's uncommitted work out of our commits.
- **Commit message trailers** (every commit):
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0113uJzQtVVxBFBYe4gdGJ9M
  ```
- **Images:** freely-licensed for commercial use, self-hosted, web-optimized, with `alt` text and explicit `width`/`height` where placed. Every image visually verified (via Read, which renders images) to be thematically correct before use.
- **Verification is browser-based** (no test framework exists). Serve locally with `python3 -m http.server 8000` from repo root and confirm behavior. Respect `prefers-reduced-motion`.

---

### Task 1: Source and self-host imagery + manifest

**Files:**
- Create: `assets/images/hero-01.jpg` … `hero-05.jpg` (5 hero photos)
- Create: `assets/images/projects/welding-01.jpg` … `welding-04.jpg`, `structural-01.jpg` … `structural-04.jpg`, `architectural-01.jpg` … `architectural-04.jpg` (12 portfolio photos)
- Create: `assets/images/owner.jpg` (1 portrait-style photo)
- Create: `assets/images/IMAGES.md` (manifest)

**Interfaces:**
- Produces: 18 image files at the exact paths above (referenced by Tasks 3–6), plus a manifest documenting source URL + license + category + intended slot for each, so real MQ Steel photos can replace them 1:1.

- [ ] **Step 1: Download hero + portfolio + owner images**

Use Unsplash CDN direct URLs (Unsplash License — free for commercial use, no attribution required). Download at ~1600px wide, quality 80, JPEG. Example command shape (repeat per curated photo ID, mapping to the target filename):

```bash
cd /Users/bryanmejia/Developer/mq-steel-web/mq-steel-corp
# hero (landscape, dramatic steel/welding/architecture)
curl -fsSL "https://images.unsplash.com/photo-<ID>?w=1600&q=80&fm=jpg&fit=crop" -o assets/images/hero-01.jpg
# portfolio (welding / structural erection / architectural steel), ~1200px
curl -fsSL "https://images.unsplash.com/photo-<ID>?w=1200&q=80&fm=jpg&fit=crop" -o assets/images/projects/welding-01.jpg
# owner (portrait orientation)
curl -fsSL "https://images.unsplash.com/photo-<ID>?w=900&q=80&fm=jpg&fit=crop&crop=faces" -o assets/images/owner.jpg
```

Curate photo IDs by theme: hero = wide shots of steel structures / erection / welding sparks; welding-* = close welding/fabrication; structural-* = beams, erection, warehouses, cranes; architectural-* = finished architectural steel/facades/staircases; owner = a professional tradesperson/portrait.

- [ ] **Step 2: Visually verify every downloaded image**

Read each file (the Read tool renders images) and confirm it is thematically correct, professional, and not a broken/placeholder download. Replace any image that is off-theme, low quality, or failed to download (0 bytes) by choosing a different photo ID and re-running the curl.

Run: `ls -la assets/images assets/images/projects && file assets/images/*.jpg assets/images/projects/*.jpg`
Expected: every file present, non-zero size, reported as `JPEG image data` with sensible dimensions.

- [ ] **Step 3: Fallback if downloads are blocked**

If network/curl is unavailable, generate crafted SVG placeholders instead (dark steel gradient + centered label like "WELDING 01" in Oswald), saved at the same paths but `.svg`, and update references accordingly. Note this substitution in the manifest. (Only if Step 1 cannot succeed.)

- [ ] **Step 4: Write the manifest**

Create `assets/images/IMAGES.md` listing, per file: target slot (e.g. "Hero slide 1", "Portfolio — Welding"), category tag, source URL, license ("Unsplash License — commercial use OK"), and a "Replace with:" note guiding the owner to swap in a real MQ Steel photo of the same aspect ratio.

- [ ] **Step 5: Commit**

```bash
git add assets/images/
git commit -m "feat: add self-hosted steel/welding/architecture imagery + manifest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0113uJzQtVVxBFBYe4gdGJ9M"
```

---

### Task 2: Design-system foundation + navbar/footer chrome

Rewrites the shared CSS layer (tokens, primitives, motifs) and restyles the always-present chrome (navbar, footer), including the `#work` nav-link fix. Existing section rules keep working until each section task restyles them.

**Files:**
- Modify: `assets/css/styles.css` (`:root` tokens; add utilities `.eyebrow`, `.band`, `.blueprint`; restyle `.navbar*`, `.footer*`)
- Modify: `index.html` (navbar + footer + mobile-menu link hrefs/labels only)

**Interfaces:**
- Produces CSS custom properties and utility classes consumed by Tasks 3–7:
  - Tokens: `--color-steel: #1C1E26`, `--color-line: rgba(200,150,62,0.28)` (blueprint gold hairline), `--color-line-steel: rgba(27,30,38,0.12)`, plus existing tokens retained.
  - `.eyebrow` — Oswald, uppercase, letter-spaced, gold, with a `data`/`::before` number slot (numbered section label).
  - `.band` — full-bleed dark structural section wrapper (navy background, light text).
  - `.blueprint` — corner hairline accent (applied to photo panels).
- Anchor contract: navbar/footer/mobile-menu "Our Work" link now targets `#work` (was `#about-company`).

- [ ] **Step 1: Update `:root` tokens and base**

In `assets/css/styles.css`, add to `:root` (keep all existing tokens):

```css
  --color-steel:       #1C1E26;
  --color-line:        rgba(200, 150, 62, 0.28);
  --color-line-steel:  rgba(27, 30, 38, 0.14);
  --radius-sm: 2px;   /* sharper, engineered feel (was 4px) */
  --radius-md: 4px;   /* was 8px */
  --radius-lg: 6px;   /* was 12px */
```

- [ ] **Step 2: Add shared motif utilities**

Append to `styles.css`:

```css
/* Section eyebrow (numbered, blueprint-spec feel) */
.eyebrow {
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--color-accent);
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}
.eyebrow::before {
  content: attr(data-num);
  color: var(--color-primary);
  opacity: 0.35;
}

/* Dark structural band */
.band { background: var(--color-primary); color: var(--color-light); }
.band .section__title,
.band .eyebrow::before { color: var(--color-white); }

/* Blueprint corner accent on photo panels */
.blueprint { position: relative; }
.blueprint::after {
  content: '';
  position: absolute;
  inset: var(--space-sm);
  border: 1px solid var(--color-line);
  pointer-events: none;
}
```

- [ ] **Step 3: Restyle navbar (keep all classes/IDs)**

Replace the `.navbar` background behavior so it is transparent over the hero and solid on scroll. Update rules (do not rename classes):

```css
.navbar { background-color: transparent; }
.navbar--scrolled { background-color: rgba(17,17,25,0.95); box-shadow: var(--shadow-md); }
/* subtle gold baseline when scrolled */
.navbar--scrolled { border-bottom: 1px solid var(--color-line); }
```

- [ ] **Step 4: Restyle footer**

Give the footer a hairline top border and tighten spacing:

```css
.footer { border-top: 1px solid var(--color-line); }
```

- [ ] **Step 5: Fix nav/footer/mobile-menu links in `index.html`**

In `index.html`, change every `href="#about-company"` whose visible text is "Our Work" to `href="#work"` and keep the label "Our Work" (three places: `.navbar__links`, `.navbar__mobile-menu`, `.footer__links`). Leave the separate "About" → `#about` links untouched. (The "Who We Are" section keeps `id="about-company"`; a new "Work" link points at the new `#work` portfolio added in Task 5. Until Task 5 lands, `#work` simply won't resolve — acceptable mid-build.)

- [ ] **Step 6: Verify**

Run: `python3 -m http.server 8000` (background) then load `http://localhost:8000/`.
Expected: page loads; navbar is transparent at top and turns solid dark after scrolling >100px; hamburger opens/closes the mobile menu at narrow widths; no console errors. (`#work` link is a no-op until Task 5 — fine.)

- [ ] **Step 7: Commit**

```bash
git add assets/css/styles.css index.html
git commit -m "feat: design-system tokens, motifs, restyled navbar/footer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0113uJzQtVVxBFBYe4gdGJ9M"
```

---

### Task 3: Hero — real image carousel + structural side-band

**Files:**
- Modify: `index.html` (`.hero` section markup)
- Modify: `assets/css/styles.css` (`.hero*`, `.project-card*`)

**Interfaces:**
- Consumes: `assets/images/hero-01.jpg`…`hero-05.jpg` (Task 1); `.blueprint`, `.eyebrow` (Task 2).
- Preserves: `#projectCarousel` `.splide` structure so main.js Splide init is unchanged.
- Produces: hero CTA `href="#work"` (portfolio) and `href="#contact"`.

- [ ] **Step 1: Swap gradient slides for image slides**

In `index.html`, replace each `<div class="project-card project-card--N"></div>` with an image-backed slide. Keep the `.splide` / `.splide__track` / `.splide__list` / `.splide__slide` wrappers and the `#projectCarousel` id exactly. Use 5 slides:

```html
<li class="splide__slide">
  <img class="hero__img" src="assets/images/hero-01.jpg" alt="Structural steel erection by MQ Steel Corp" />
</li>
```

- [ ] **Step 2: Restructure hero content (eyebrow + side-band + CTAs)**

Replace `.hero__content` inner markup:

```html
<div class="hero__content">
  <p class="eyebrow hero__eyebrow" data-num="//">Structural Steel · Welding · Architecture</p>
  <h1 class="hero__title">MQ STEEL CORP</h1>
  <p class="hero__tagline">Welding Precision &amp; Structural Excellence</p>
  <div class="hero__ctas">
    <a href="#work" class="btn btn--primary">View Our Work</a>
    <a href="#contact" class="btn btn--outline">Get in Touch</a>
  </div>
</div>
```

- [ ] **Step 3: Restyle hero CSS (left-aligned, side-band, blueprint lines, image fit)**

Update/replace hero rules. Make images cover their slide; left-align content within the container; add a dark structural side-band gradient and a thin blueprint vertical line. Delete the `.project-card--1..6` gradient rules (no longer used).

```css
.hero { text-align: left; justify-content: flex-start; }
.hero__img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hero__carousel .splide__slide { display: block; }
/* directional structural overlay instead of flat dim */
.hero__overlay {
  background: linear-gradient(90deg, rgba(17,17,25,0.85) 0%, rgba(17,17,25,0.55) 45%, rgba(17,17,25,0.25) 100%);
}
.hero__content {
  margin: 0;
  padding-left: clamp(var(--space-md), 6vw, var(--space-4xl));
  border-left: 2px solid var(--color-accent);
  max-width: 820px;
}
.hero__eyebrow { color: var(--color-accent); }
```

- [ ] **Step 4: Verify**

Reload `http://localhost:8000/`.
Expected: hero shows real photos fading every 5s (Splide autoplay intact); content is left-aligned with a gold rule; eyebrow, title, tagline, and two buttons render; "View Our Work" scrolls toward `#work` once Task 5 lands (for now scrolls to bottom/no-op); "Get in Touch" smooth-scrolls to the contact form. No console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html assets/css/styles.css
git commit -m "feat: image-backed hero carousel with structural side-band

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0113uJzQtVVxBFBYe4gdGJ9M"
```

---

### Task 4: "Who We Are" — split layout + stats band

**Files:**
- Modify: `index.html` (`#about-company` section)
- Modify: `assets/css/styles.css` (`.company*`, `.stat*`)

**Interfaces:**
- Consumes: `assets/images/projects/structural-01.jpg` (or a chosen hero image) for the photo panel; `.eyebrow`, `.blueprint`, `.band` (Task 2).
- Preserves: `id="about-company"`, the three stat blocks and their numbers.

- [ ] **Step 1: Restructure markup to a two-column split**

Wrap the existing copy in a left column and add a right-hand photo panel; keep the section `id`, keep the three `.stat` blocks (move them into a full-width band below the split). Add the numbered eyebrow:

```html
<section class="section company" id="about-company">
  <div class="container company__grid">
    <div class="company__col">
      <p class="eyebrow" data-num="01">Who We Are</p>
      <h2 class="section__title company__title">Building America's infrastructure with precision and integrity</h2>
      <div class="company__text"><!-- existing three <p> paragraphs, unchanged --></div>
    </div>
    <div class="company__media blueprint">
      <img src="assets/images/projects/structural-01.jpg" alt="MQ Steel Corp structural steel work" loading="lazy" width="1200" height="1500" />
    </div>
  </div>
  <div class="company__stats-band band">
    <div class="container company__stats"><!-- existing three .stat blocks --></div>
  </div>
</section>
```

- [ ] **Step 2: Left-align the section title for the split layout**

The global `.section__title` is centered; add a left-aligned modifier used here so the eyebrow/title/copy read as a column:

```css
.company__title { text-align: left; }
.company__title::after { margin-left: 0; margin-right: auto; }
.company__text { text-align: left; margin-inline: 0; max-width: none; }
```

- [ ] **Step 3: Grid + media + stats-band CSS**

```css
.company__grid { display: grid; grid-template-columns: 1fr; gap: var(--space-2xl); align-items: center; }
.company__media { border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-lg); }
.company__media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.company__stats-band { margin-top: var(--space-3xl); padding-block: var(--space-2xl); }
.company__stats-band .stat { background: transparent; }
.company__stats-band .stat__label { color: var(--color-light); }
@media (min-width: 768px) {
  .company__grid { grid-template-columns: 1.1fr 0.9fr; }
}
```

- [ ] **Step 4: Verify**

Reload. Expected: on desktop, copy sits left of a steel photo with a gold blueprint corner; stats appear in a dark band with gold numbers below; on mobile everything stacks; images lazy-load; no layout shift (width/height set); no console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html assets/css/styles.css
git commit -m "feat: split 'Who We Are' layout with stats band

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0113uJzQtVVxBFBYe4gdGJ9M"
```

---

### Task 5: Portfolio section (NEW) — filterable grid + accessible lightbox

The centerpiece. New markup + CSS + a dependency-free JS module. Inserted between "Who We Are" and "Meet the Owner".

**Files:**
- Modify: `index.html` (insert `#work` section; add `<script defer src="assets/js/portfolio.js"></script>` before `</body>`)
- Modify: `assets/css/styles.css` (`.work*`, `.filter*`, `.lightbox*`)
- Create: `assets/js/portfolio.js`

**Interfaces:**
- Consumes: 12 portfolio images (Task 1); `.eyebrow`, tokens (Task 2).
- Produces: anchor `#work` (target of nav/hero links); a `.work__item` grid each carrying `data-category` in {`welding`,`structural`,`architectural`} and `data-full` (large src) + `data-alt`; a lightbox root `#lightbox`.
- `portfolio.js` reads `.filter__chip[data-filter]`, `.work__item`, `#lightbox` — it does not touch any main.js element.

- [ ] **Step 1: Add the portfolio markup**

Insert after the `#about-company` section:

```html
<section class="section work" id="work">
  <div class="container">
    <p class="eyebrow" data-num="02">Our Work</p>
    <h2 class="section__title">Steel that stands the test of time</h2>
    <p class="section__subtitle">A selection of welding, structural, and architectural projects.</p>

    <div class="filter" role="tablist" aria-label="Filter projects">
      <button class="filter__chip filter__chip--active" data-filter="all" aria-pressed="true">All</button>
      <button class="filter__chip" data-filter="welding" aria-pressed="false">Welding</button>
      <button class="filter__chip" data-filter="structural" aria-pressed="false">Structural</button>
      <button class="filter__chip" data-filter="architectural" aria-pressed="false">Architectural</button>
    </div>

    <ul class="work__grid">
      <!-- Repeat for all 12 images. Example (welding-01): -->
      <li class="work__item" data-category="welding">
        <button class="work__btn" data-full="assets/images/projects/welding-01.jpg"
                data-alt="Close-up welding on structural steel">
          <img src="assets/images/projects/welding-01.jpg" alt="Close-up welding on structural steel"
               loading="lazy" width="1200" height="900" />
          <span class="work__tag">Welding</span>
        </button>
      </li>
    </ul>
  </div>

  <div class="lightbox" id="lightbox" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Project image viewer">
    <button class="lightbox__close" aria-label="Close viewer">&times;</button>
    <button class="lightbox__nav lightbox__nav--prev" aria-label="Previous image">&#8249;</button>
    <img class="lightbox__img" src="" alt="" />
    <button class="lightbox__nav lightbox__nav--next" aria-label="Next image">&#8250;</button>
  </div>
</section>
```

Add before `</body>` (after the existing main.js script tag):

```html
<script defer src="assets/js/portfolio.js"></script>
```

- [ ] **Step 2: Portfolio + lightbox CSS**

```css
.filter { display: flex; flex-wrap: wrap; gap: var(--space-sm); justify-content: center; margin-bottom: var(--space-2xl); }
.filter__chip {
  font-family: var(--font-heading); font-size: var(--fs-sm); font-weight: var(--fw-semibold);
  text-transform: uppercase; letter-spacing: 1px; padding: var(--space-sm) var(--space-lg);
  border: 1px solid var(--color-line-steel); border-radius: var(--radius-sm);
  background: transparent; color: var(--color-primary); cursor: pointer;
  transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}
.filter__chip:hover { border-color: var(--color-accent); }
.filter__chip--active { background: var(--color-accent); color: var(--color-dark); border-color: var(--color-accent); }

.work__grid { display: grid; grid-template-columns: 1fr; gap: var(--space-md); list-style: none; }
.work__item { }
.work__btn {
  display: block; position: relative; width: 100%; padding: 0; border: 0; cursor: pointer;
  overflow: hidden; border-radius: var(--radius-md); background: var(--color-steel);
}
.work__btn img { width: 100%; height: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block;
  transition: transform var(--transition-base); }
.work__btn:hover img, .work__btn:focus-visible img { transform: scale(1.05); }
.work__tag {
  position: absolute; left: var(--space-sm); bottom: var(--space-sm);
  font-family: var(--font-display); font-size: var(--fs-sm); letter-spacing: 0.15em; text-transform: uppercase;
  color: var(--color-white); background: rgba(17,17,25,0.7); padding: 2px var(--space-sm); border-radius: var(--radius-sm);
}
.work__item[hidden] { display: none; }
@media (min-width: 640px) { .work__grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .work__grid { grid-template-columns: repeat(3, 1fr); } }

/* Lightbox */
.lightbox {
  position: fixed; inset: 0; z-index: 2000; display: none;
  align-items: center; justify-content: center; background: rgba(17,17,25,0.92);
}
.lightbox--open { display: flex; }
.lightbox__img { max-width: 90vw; max-height: 85vh; object-fit: contain; border: 1px solid var(--color-line); }
.lightbox__close, .lightbox__nav {
  position: absolute; background: transparent; border: 0; color: var(--color-white);
  font-size: 2.5rem; line-height: 1; cursor: pointer; padding: var(--space-md);
}
.lightbox__close { top: var(--space-md); right: var(--space-lg); }
.lightbox__nav--prev { left: var(--space-md); }
.lightbox__nav--next { right: var(--space-md); }
.lightbox__nav:hover, .lightbox__close:hover { color: var(--color-accent); }
@media (prefers-reduced-motion: reduce) { .work__btn img { transition: none; } }
```

- [ ] **Step 3: Write `assets/js/portfolio.js` (filter + accessible lightbox)**

```js
/* Portfolio filter + accessible lightbox. Dependency-free. Does not touch main.js elements. */
(function () {
  const chips = Array.from(document.querySelectorAll('.filter__chip'));
  const items = Array.from(document.querySelectorAll('.work__item'));
  const lightbox = document.getElementById('lightbox');
  if (!items.length || !lightbox) return;

  const lbImg   = lightbox.querySelector('.lightbox__img');
  const btnClose= lightbox.querySelector('.lightbox__close');
  const btnPrev = lightbox.querySelector('.lightbox__nav--prev');
  const btnNext = lightbox.querySelector('.lightbox__nav--next');

  /* --- Filtering --- */
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
      });
    });
  });

  /* --- Lightbox --- */
  let current = -1;            // index into the currently-visible items
  let lastFocused = null;

  const visibleItems = () => items.filter((i) => !i.hidden);

  function openAt(item) {
    const vis = visibleItems();
    current = vis.indexOf(item);
    render(vis[current]);
    lastFocused = document.activeElement;
    lightbox.classList.add('lightbox--open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    btnClose.focus();
    document.addEventListener('keydown', onKeydown);
  }

  function render(item) {
    const btn = item.querySelector('.work__btn');
    lbImg.src = btn.dataset.full;
    lbImg.alt = btn.dataset.alt || '';
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
    if (e.key === 'Escape') { close(); }
    else if (e.key === 'ArrowRight') { step(1); }
    else if (e.key === 'ArrowLeft') { step(-1); }
    else if (e.key === 'Tab') {
      // simple focus trap across the three controls
      const focusables = [btnClose, btnPrev, btnNext];
      const idx = focusables.indexOf(document.activeElement);
      e.preventDefault();
      const nextIdx = e.shiftKey ? (idx - 1 + focusables.length) % focusables.length
                                 : (idx + 1) % focusables.length;
      focusables[nextIdx].focus();
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
```

- [ ] **Step 4: Verify (mouse + keyboard)**

Reload `http://localhost:8000/`.
Expected:
- Grid shows 12 images (3 cols desktop, 2 tablet, 1 mobile), each with a category tag.
- Clicking a filter chip shows only that category; "All" restores; active chip is gold; `aria-pressed` toggles.
- Clicking an image opens the lightbox with the correct photo; ← / → cycle within the current filter; ESC and backdrop click close; focus returns to the triggering image; Tab cycles the close/prev/next controls only.
- Nav/hero "View Our Work" now smooth-scrolls to this section.
- No console errors; main.js features (carousel, form, menu) still work.

- [ ] **Step 5: Commit**

```bash
git add index.html assets/css/styles.css assets/js/portfolio.js
git commit -m "feat: portfolio gallery with filters and accessible lightbox

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0113uJzQtVVxBFBYe4gdGJ9M"
```

---

### Task 6: "Meet the Owner" — real portrait panel

**Files:**
- Modify: `index.html` (`#about` section)
- Modify: `assets/css/styles.css` (`.about__portrait`)

**Interfaces:**
- Consumes: `assets/images/owner.jpg` (Task 1); `.blueprint`, `.eyebrow` (Task 2).
- Preserves: `id="about"`, bio copy.

- [ ] **Step 1: Replace the placeholder portrait with a real image + eyebrow**

In `index.html` `#about`, add a numbered eyebrow above the title and replace the placeholder `.about__portrait` (currently a gradient div with a `<span>`) with an image panel:

```html
<p class="eyebrow" data-num="03">Leadership</p>
```
```html
<div class="about__portrait blueprint">
  <img src="assets/images/owner.jpg" alt="MQ Steel Corp founder and CEO" loading="lazy" width="900" height="1200" />
</div>
```

- [ ] **Step 2: Update portrait CSS to hold an image**

```css
.about__portrait { background: var(--color-steel); }
.about__portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
.about__portrait::before { display: none; } /* old inner gold frame replaced by .blueprint */
```

- [ ] **Step 3: Verify**

Reload. Expected: owner section shows a real portrait with a blueprint corner accent; numbered "03 — Leadership" eyebrow; bio text unchanged and readable; responsive two-column on desktop, stacked on mobile.

- [ ] **Step 4: Commit**

```bash
git add index.html assets/css/styles.css
git commit -m "feat: real portrait panel for owner section

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0113uJzQtVVxBFBYe4gdGJ9M"
```

---

### Task 7: Contact section restyle (functionality preserved)

**Files:**
- Modify: `index.html` (`#contact` section — eyebrow only; form markup untouched)
- Modify: `assets/css/styles.css` (`.contact*`, `.form-group*`)

**Interfaces:**
- Preserves: `#contactForm`, inputs named `name`/`email`/`company`/`service`, submit button, `.form__consent` privacy link. **No JS or field changes.**

- [ ] **Step 1: Add numbered eyebrow; keep the form exactly**

In `index.html` `#contact`, add above the title:

```html
<p class="eyebrow" data-num="04">Get in Touch</p>
```
Do not alter any `<form>`, `<input>`, `<textarea>`, `<label>`, button, or consent markup.

- [ ] **Step 2: Restyle inputs to the new system (still dark section)**

The `.contact` section is already dark (`--color-primary`); refine field styling and the eyebrow-on-dark:

```css
.contact .eyebrow::before { color: var(--color-white); }
.form-group input, .form-group textarea { border-radius: var(--radius-sm); }
.form-group input:focus, .form-group textarea:focus { border-color: var(--color-accent); }
```

- [ ] **Step 3: Verify form still works**

Reload. Fill the form and submit.
Expected: submit button shows "Sending…" → "Message Sent!" and the form resets (Firestore write succeeds via existing main.js). If Firestore/network is unavailable it shows the graceful error state — same as before the redesign. No console errors beyond any pre-existing EmailJS "not configured" skip.

- [ ] **Step 4: Commit**

```bash
git add index.html assets/css/styles.css
git commit -m "feat: restyle contact section (form functionality unchanged)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0113uJzQtVVxBFBYe4gdGJ9M"
```

---

### Task 8: Full integration + responsive + accessibility pass

**Files:**
- Modify (as needed for fixes found): `index.html`, `assets/css/styles.css`, `assets/js/portfolio.js`

**Interfaces:**
- Consumes: everything from Tasks 1–7. Produces: a verified, shippable page.

- [ ] **Step 1: Cross-section responsive check**

At widths 375px, 768px, 1024px, 1440px, confirm: no horizontal scroll; hero content readable over photos; company split collapses cleanly; portfolio grid reflows 3→2→1; owner stacks; footer centered. Fix any overflow with targeted CSS.

- [ ] **Step 2: Functionality regression check (the preserved contract)**

Confirm each still works: mobile hamburger open/close + body scroll lock; navbar solid-on-scroll; hero Splide autoplay/fade; all smooth-scroll anchors including `#work`; contact form submit path; reCAPTCHA badge hidden. Fix regressions.

- [ ] **Step 3: Accessibility check**

Keyboard-only: tab through nav → hero CTAs → filter chips → gallery items → lightbox (trap) → form. Confirm visible focus, `alt` on all images, `aria-pressed` on chips, lightbox `aria-modal` behavior. Confirm `prefers-reduced-motion` disables the image zoom transition.

- [ ] **Step 4: Console + asset check**

Confirm zero console errors and every image returns 200 (check the server log or DevTools network). Fix broken paths.

- [ ] **Step 5: Final verification via the `verify` skill (optional but recommended)**

Drive the page end-to-end (carousel, filter, lightbox keyboard, form) and capture a screenshot for the user.

- [ ] **Step 6: Final commit (only if fixes were made)**

```bash
git add index.html assets/css/styles.css assets/js/portfolio.js
git commit -m "fix: responsive + accessibility polish for redesign

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0113uJzQtVVxBFBYe4gdGJ9M"
```

---

## Self-Review

**Spec coverage:**
- Design language (fonts kept, palette, blueprint motifs, sharper corners) → Task 2. ✓
- Navbar transparent→solid + "Our Work" mislink fix → Task 2. ✓
- Hero real-image carousel + structural side-band, Splide preserved → Task 3. ✓
- Who We Are split + stats band → Task 4. ✓
- Portfolio (filters + accessible lightbox, lazy-load, alt) → Task 5. ✓
- Meet the Owner real portrait → Task 6. ✓
- Contact restyle with form functionality preserved → Task 7. ✓
- Footer restyle → Task 2. ✓
- Self-hosted freely-licensed images + IMAGES.md manifest → Task 1. ✓
- Functionality contract (all main.js DOM hooks) → Global Constraints + preserved per task; verified Task 8. ✓
- Accessibility + performance + responsive → Task 5 (lightbox), Task 8. ✓
- Non-goals respected (no services/process/testimonials, no backend changes, no fake contact info). ✓

**Placeholder scan:** No "TBD/TODO"; every code step contains real code; image photo IDs are chosen during Task 1 with a concrete visual-verification loop and a documented fallback (not a placeholder — it's a sourcing step with acceptance criteria).

**Type/name consistency:** `data-category` values `welding`/`structural`/`architectural` match between Task 5 markup, filter chips, and `portfolio.js`. `data-full`/`data-alt` produced in markup are consumed in `portfolio.js` `render()`. `.filter__chip--active`, `.lightbox--open`, `#lightbox` consistent across CSS + JS. Anchor `#work` consistent across Tasks 2/3/5. Utilities `.eyebrow`/`.band`/`.blueprint` defined in Task 2, used in 3–7.
