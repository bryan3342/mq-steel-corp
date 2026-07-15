# MQ Steel Corp — Landing Page Redesign ("Modern Structural")

**Date:** 2026-07-15
**Status:** Approved — ready for implementation planning
**Scope:** Restyle the single-page landing site (`index.html`) and add one new
Portfolio section. Preserve 100% of existing functionality.

---

## 1. Goal

Revamp the visual style of the MQ Steel Corp landing page into an image-forward,
professional presentation of the company's welding, structural-steel, and
architectural work — while keeping every piece of current functionality intact.

Chosen design direction: **Modern Structural** — a light base with strong dark
"structural" bands and thin blueprint-style grid-line accents, blending
architectural polish with welding/fabrication strength.

The current typography (Oswald / Montserrat / Inter) is kept exactly as-is.

## 2. Non-goals (explicitly out of scope)

- No Services section, no Process strip, no testimonials, no client-logo strip.
  (User chose "Portfolio gallery" + "Keep it lean".)
- No changes to backend behavior: Firestore writes, EmailJS notification flow,
  reCAPTCHA notice, and privacy policy remain functionally unchanged.
- No new build tooling or frameworks — stays a static site (HTML/CSS/vanilla JS).
- The separate `admin/` portal is untouched.
- No invented/fake contact details (no fabricated phone/email/address).

## 3. Design language

### Typography (unchanged)
- `Oswald` — display: hero title, numbered section eyebrows, stat numbers.
- `Montserrat` — headings.
- `Inter` — body.

### Palette (keeps brand DNA, rebalanced onto a light base)
- Structural navy `#1A1A2E` (existing `--color-primary`) — nav, dark bands,
  contact, footer.
- Add a steel-charcoal neutral for secondary dark surfaces / borders.
- Gold `#C8963E` (existing `--color-accent`) — used **sparingly**: hairline
  rules, active filter chips, stat numbers, section eyebrows.
- Warm off-white `#F5F4F2` (existing `--color-light`) + white panels for light
  sections.
- New **blueprint hairline** tokens: thin, low-opacity gold/steel lines for
  structural-drawing accents and dividers.

### Motifs
- Numbered section eyebrows in Oswald (e.g. `01 — Who We Are`).
- Thin blueprint grid-line accents at panel/section corners.
- Sharper corners (reduced border-radius) for an "engineered" feel.
- Full-bleed photography paired with dark structural side-panels.

## 4. Page structure (top → bottom)

Each item lists what changes and what is preserved.

1. **Navbar** — *functionality preserved.*
   - Transparent over hero → solid dark on scroll (existing `navbar--scrolled`).
   - Links: `Home · Work · About · Contact`.
   - **Fix:** current "Our Work" link points at `#about-company` (the Who We Are
     section); it will point at the new portfolio (`#work`). Nav + mobile menu +
     footer links updated to match.
   - Hamburger + mobile menu markup/classes unchanged.

2. **Hero** — *carousel preserved.*
   - Full-viewport Splide **fade** carousel (`#projectCarousel`, `.splide`
     markup) now backed by **real steel/welding/architecture photos** instead of
     CSS gradients.
   - Left-aligned content over a dark structural side-band with blueprint
     hairlines: eyebrow (`STRUCTURAL STEEL · WELDING · ARCHITECTURE`) → Oswald
     "MQ STEEL CORP" → tagline → two CTAs (`View Our Work` → `#work`,
     `Get in Touch` → `#contact`).
   - Dark overlay retained for text legibility.

3. **Who We Are** (`#about-company`) — *restyled.*
   - Two-column split on desktop: numbered eyebrow + heading + existing copy on
     one side; a photo panel with a blueprint-corner accent on the other.
     Stacks on mobile.
   - Existing stats (`15+ / 200+ / 100%`) become a dark structural strip with
     gold Oswald numbers.

4. **Our Work — Portfolio** (`#work`) — **NEW, the centerpiece.**
   - Numbered eyebrow + heading + subtitle.
   - Filter chips: `All · Welding · Structural · Architectural` (active chip in
     gold).
   - Responsive image grid (~9–12 photos), each tagged with a category.
   - Click opens an **accessible lightbox**: ESC to close, ← / → to navigate,
     backdrop click to close, focus trapped while open, focus restored on close,
     `aria` labelling.
   - Images `loading="lazy"`, explicit width/height (no layout shift), `alt`
     text per image.

5. **Meet the Owner** (`#about`) — *restyled.*
   - Same bio copy. Gradient placeholder replaced with a real portrait-style
     photo panel + blueprint accent.

6. **Contact** (`#contact`) — *form + all functionality preserved.*
   - Dark structural section; inputs restyled to the new system.
   - **Identical** behavior: `#contactForm`, field names `name / email /
     company / service`, Firestore `addDoc` to `submissions`, EmailJS best-effort
     notification, submit-button states, privacy-policy consent link.

7. **Footer** — *preserved.*
   - Same links (updated "Our Work" → `#work`), reCAPTCHA notice, copyright;
     restyled to the new system.

## 5. Functionality contract (must not break)

`assets/js/main.js` depends on the following. All must remain present and behave
the same:

| Dependency | Requirement |
|---|---|
| `#hamburger`, `#mobileMenu`, classes `navbar__mobile-menu--open`, `navbar__hamburger--active` | Mobile menu toggle unchanged |
| `#navbar` + class `navbar--scrolled` | Scroll effect unchanged |
| `#projectCarousel` with `.splide / .splide__track / .splide__list / .splide__slide` | Splide init unchanged; slides swap gradient divs → images |
| `a[href^="#"]` | Smooth-scroll handler unchanged; anchor IDs `#home / #about-company / #about / #contact` kept, `#work` added |
| `#contactForm`, `button[type="submit"]`, field names `name/email/company/service` | Form submit + Firestore + EmailJS unchanged |
| `.grecaptcha-badge` hidden style, `privacy.html` link | Kept |

**New JS** is limited to a small, dependency-free Portfolio filter + lightbox
module, added without modifying the existing handlers. Splide + Firebase +
EmailJS imports remain as-is.

## 6. Images

- Source **freely-licensed, commercial-use** photos (Unsplash / Pexels) covering:
  welding/fabrication, structural-steel erection, and finished architectural
  steel.
- **Download and self-host** — no hotlinking. Hero images in `assets/images/`,
  portfolio images in `assets/images/projects/`.
- Clear, swappable filenames (e.g. `hero-01.jpg`, `project-welding-01.jpg`).
- Add `assets/images/IMAGES.md` — a manifest listing each file, its category,
  source URL, and license note, so real MQ Steel photos can replace them 1:1.
- Verify each file actually downloads and is commercial-use licensed before use.
- Reasonable file sizes (web-optimized); dimensions recorded to set width/height.

## 7. Accessibility & performance

- Portfolio images lazy-loaded with explicit dimensions; descriptive `alt`.
- Lightbox fully keyboard-operable and screen-reader labelled.
- Respect `prefers-reduced-motion` for the added interactions.
- Maintain existing responsive breakpoints (768 / 1024 / 1440) and mobile-first
  approach.

## 8. Files touched

- `index.html` — restructured markup for the new sections/motifs (IDs/classes in
  the functionality contract preserved).
- `assets/css/styles.css` — new design system (tokens, structural bands,
  blueprint accents, portfolio grid, lightbox, restyled sections).
- `assets/js/main.js` — **append** portfolio filter + lightbox; existing code
  unchanged.
- `assets/images/` + `assets/images/projects/` — new self-hosted photos.
- `assets/images/IMAGES.md` — image manifest (new).
- `assets/css/reset.css`, `privacy.css`, `privacy.html` — unchanged unless a
  shared token rename requires a trivial follow-through.

## 9. Verification

- Load the page locally; confirm hero carousel autoplays, mobile menu toggles,
  navbar goes solid on scroll, smooth-scroll anchors work, portfolio filters +
  lightbox work (mouse + keyboard), and the contact form still submits to
  Firestore (or fails gracefully) — matching pre-redesign behavior.
- Check responsive layout at mobile / tablet / desktop widths.
- Confirm no console errors and all images load.
