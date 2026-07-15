/**
 * Provision an admin (email + password) from the terminal — for the first admin and any
 * teammate IT adds later. Creates a Firebase Auth user (or, if the email already exists,
 * resets its password), marks the email as verified so they can sign in immediately, and
 * adds them to the `admins` allowlist. Accounts and the allowlist are managed only here —
 * the portal itself has no sign-up, password-reset, or invite UI.
 *
 * Setup:
 *   1. Firebase Console → Project settings → Service accounts → "Generate new private key".
 *      Save the file next to this script as `serviceAccountKey.json` (git-ignored).
 *   2. npm install            (installs firebase-admin from scripts/package.json)
 *   3. node provision-admin.mjs <email> <password>
 *
 * Examples:
 *   node provision-admin.mjs owner@mqsteelcorp.com 'a-strong-password'     # first admin
 *   node provision-admin.mjs teammate@mqsteelcorp.com 'their-password'     # add a teammate
 *   node provision-admin.mjs owner@mqsteelcorp.com 'new-password'          # reset a password
 *
 * To REMOVE an admin: delete their user in Firebase Console → Authentication, and delete
 * their document from the `admins` collection in Firestore.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const [, , rawEmail, password] = process.argv;
if (!rawEmail || !password) {
  console.error('Usage: node provision-admin.mjs <email> <password>');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}
const email = rawEmail.trim().toLowerCase();

const serviceAccount = JSON.parse(
  readFileSync(new URL('./serviceAccountKey.json', import.meta.url)),
);
initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db = getFirestore();

try {
  let user;
  try {
    user = await auth.createUser({ email, password, emailVerified: true });
    console.log(`Created auth user ${email} (uid ${user.uid}).`);
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      user = await auth.getUserByEmail(email);
      await auth.updateUser(user.uid, { password, emailVerified: true });
      console.log(`Auth user ${email} already existed — reset password and marked verified.`);
    } else {
      throw err;
    }
  }

  await db.doc(`admins/${email}`).set(
    { addedBy: 'terminal', addedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  console.log(`Allowlisted ${email} in /admins. Done — they can sign in now.`);
  process.exit(0);
} catch (err) {
  console.error('Failed:', err.message ?? err);
  process.exit(1);
}
