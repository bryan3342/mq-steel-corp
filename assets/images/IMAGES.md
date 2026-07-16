# Image Manifest — MQ Steel Corp

All photos are **real MQ Steel Corp project photos** supplied by the owner
(sourced from a WhatsApp chat, 2026-07-15), resized/compressed for web with
macOS `sips`. To swap any image for an updated photo, drop a new file at the
same path with a similar aspect ratio — no code changes needed.

## Logo / favicon
- `favicon.png` — MQ Steel Corp mascot (husky in a welding helmet + cape) on a
  navy square. Used **only** as the browser-tab icon (`<link rel="icon">` +
  `apple-touch-icon`); visible on light and dark tabs. The mascot does not appear
  anywhere on the page itself.
- `logo.png` — the transparent source cutout (owner-provided
  `mq_steel_logo-removebg-preview.png`), kept only to regenerate `favicon.png`
  via the PIL snippet. Not referenced by the site.

## Hero carousel (`assets/images/`) — 7 slides
| File | Shows |
|------|-------|
| hero-01.jpg | Steel building skeleton against blue sky |
| hero-02.jpg | Steel building frame under construction |
| hero-03.jpg | Rooftop steel canopy over city skyline |
| hero-04.jpg | Steel floor framing over foundation |
| hero-05.jpg | Multi-level steel frame erection |
| projects/welding-01.jpg | Welding a structural steel beam |
| projects/welding-02.jpg | Overhead welding on scaffold |

> The two welding shots live in the carousel (there is no separate Welding
> gallery section). `crew hoodie` in welding-02 shows a company name.

## Owner / Leadership (`assets/images/`)
- `owner.jpg` — on-site worker shot standing in for the founder. **Not an actual
  portrait of the owner** — replace with a real headshot when available.

## Portfolio gallery (`assets/images/projects/`) — 36 photos
A curated selection (trimmed ~1/3 from the full set for pacing, keeping variety
across every work type). Shown in the filterable gallery with a 3D
scroll-reveal + hover-tilt (CSS transforms only; reduced-motion safe).
- `structural-01.jpg` … `structural-24.jpg` — 24 structural photos
  (erection, framing, decking, columns, cranes, connections)
- `architectural-01.jpg` … `architectural-12.jpg` — 12 architectural photos
  (staircases, spiral stairs, railings, fire escapes, ornamental iron)

Captions/alt text for each are in `index.html` (per `data-alt`).

## Notes for the owner
- **Excluded (not used):** 4 images from the drop folder were screenshots from
  google.com / carried a third-party watermark (web-sourced reference images,
  not MQ Steel's own work). Left out so the site shows only genuine MQ Steel work.
- **People in photos:** several shots show crew members at work (faces mostly not
  identifiable). Since these are MQ Steel's own workers, that's normally fine —
  but confirm you're comfortable displaying them publicly.
- A couple of shots contain minor background signage/permits; say the word if
  you'd like any specific images removed.
