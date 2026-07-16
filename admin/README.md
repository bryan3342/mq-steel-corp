# MQ Steel Corp — Admin Portal

A static admin dashboard for reviewing and managing contact-form requests. It lives in
**this same repo** (`admin/` folder) but deploys to its **own Firebase Hosting site**
(`mq-steel-admin.web.app`), separate from the public marketing site. Same Firebase
project (`mq-steel-corp`), **email + password sign-in** + Firestore rules for access —
no backend, no Blaze plan.

Accounts are **managed entirely by IT** on the terminal — the portal itself is sign-in
only (no self-serve account creation, password reset, or team management).

The public site and this admin portal are two Hosting **targets** in the repo's
`firebase.json`:
- `public` → `mq-steel-corp` (the marketing site, root of the repo)
- `admin`  → `mq-steel-admin` (this `admin/` folder)

## Sign-in flow

- The portal shows **only** an email + password sign-in card until an approved admin
  signs in. Sign-in is **per browser session** (survives refresh, clears when the
  tab/browser closes). No submission data loads until access is confirmed.
- Access requires the email to be **allowlisted** (in `admins`) **and verified**. IT
  provisions accounts pre-verified, so admins sign straight in.

## What the team can do

- Review every submission live, search/filter, set status (New → Contacted → Closed),
  add internal notes, and click an email to reply.

## Managing admins (IT, on the terminal)

Everything is done with `scripts/provision-admin.mjs`:

```
cd admin/scripts
# Firebase Console → Project settings → Service accounts → Generate new private key,
# save it here as serviceAccountKey.json (git-ignored)
npm install
node provision-admin.mjs someone@mqsteelcorp.com
# → you'll be prompted for the password (hidden). The password is NOT passed as an
#   argument, so it never lands in shell history or `ps`. (Or set ADMIN_PW=... inline.)
```

- **Add an admin:** run it with a new email — creates the account (pre-verified) and
  allowlists them. Password must be at least 12 characters.
- **Reset a password:** run it again with the same email and enter the new password.
- **Remove an admin:** delete their user in Firebase Console → Authentication, and delete
  their document from the `admins` collection in Firestore.

## Preview locally (demo mode)

To see the dashboard populated with sample data — no Firebase setup or sign-in needed —
serve the folder and open it with `?demo=1`:

```
cd admin && python3 -m http.server 8001
# then open http://localhost:8001/?demo=1
```

Demo mode only activates on `localhost`/`127.0.0.1` **and** with `?demo=1`, so it can never
appear on the deployed site. Status/notes are interactive but nothing is saved.

## One-time setup (developer, ~10 min)

1. **Deploy the updated Firestore rules:** `firebase deploy --only firestore:rules`
2. **Create the admin Hosting site and bind the target:**
   ```
   firebase hosting:sites:create mq-steel-admin
   firebase target:apply hosting admin mq-steel-admin
   ```
3. **Enable email/password sign-in:** Firebase Console → Authentication → Sign-in method →
   enable **Email/Password**. Under **Settings → Authorized domains**, add
   `mq-steel-admin.web.app` (and any custom admin domain). *(Optional hardening: under
   User actions, disable public sign-up so only this script can create accounts.)*
4. **App Check:** add `mq-steel-admin.web.app` to the reCAPTCHA v3 site key's allowed
   domains, and confirm the app is registered under Firebase Console → App Check.
5. **Provision the first admin:** run `scripts/provision-admin.mjs` (see above).
6. **Deploy the admin site:** `firebase deploy --only hosting:admin`, then open
   `https://mq-steel-admin.web.app`.

## Deploying

- **Public site:** auto-deploys on merge to `main` (GitHub Actions, pinned to
  `target: public`). Manual: `firebase deploy --only hosting:public`.
- **Admin site:** `firebase deploy --only hosting:admin` (manual).

## Files (`admin/`)

- `index.html` — sign-in / verify / denied / Requests dashboard.
- `assets/js/firebase-config.js` — Firebase init (same project) + Auth + App Check.
- `assets/js/app.js` — email/password sign-in, live submissions, status/notes.
- `assets/css/styles.css` — styling.
- `scripts/provision-admin.mjs` — terminal tool IT uses to add admins / reset passwords.

The Hosting config for both sites lives in the repo root `firebase.json` / `.firebaserc`.

## Security notes

- All submission text is rendered with `textContent` (never `innerHTML`) — submissions
  are stored raw, so this prevents stored-XSS. Keep it that way.
- Access is enforced by Firestore rules (`isAdmin()` = **verified** email present in
  `admins`), not by hiding this page. Rules live in the repo root `firestore.rules`.
- The email-verified requirement means an account can't gain access by being created for
  an allowlisted address it doesn't control — even via the Auth API directly.
- Per-session auth; no submission query runs until the admin check passes; Sign-out shows
  only once signed in. Clients can never read, list, or modify the `admins` allowlist.
