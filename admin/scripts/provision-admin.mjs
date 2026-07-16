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
 *   3. node provision-admin.mjs <email>
 *      → you're prompted for the password (hidden), OR set it via the ADMIN_PW env var.
 *      The password is NOT an argument, so it never lands in shell history or `ps`.
 *
 * Examples:
 *   node provision-admin.mjs owner@mqsteelcorp.com               # hidden password prompt
 *   ADMIN_PW='a-strong-password' node provision-admin.mjs teammate@mqsteelcorp.com
 *
 * To REMOVE an admin: delete their user in Firebase Console → Authentication, and delete
 * their document from the `admins` collection in Firestore.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const MIN_PASSWORD_LENGTH = 12;

// Read a secret without echoing it to the terminal.
function promptHidden(query) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (str) => { if (!muted) rl.output.write(str); };
    rl.question(query, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
    muted = true; // mute AFTER the prompt is printed, so only the typed chars are hidden
  });
}

const [, , rawEmail] = process.argv;
if (!rawEmail) {
  console.error('Usage: node provision-admin.mjs <email>   (password via ADMIN_PW env or hidden prompt)');
  process.exit(1);
}
const email = rawEmail.trim().toLowerCase();

const password = process.env.ADMIN_PW || (await promptHidden(`Password for ${email}: `));
if (!password || password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

// Load credentials + init the Admin SDK, with a friendly message if the key is missing.
let auth;
let db;
try {
  const serviceAccount = JSON.parse(
    readFileSync(new URL('./serviceAccountKey.json', import.meta.url)),
  );
  initializeApp({ credential: cert(serviceAccount) });
  auth = getAuth();
  db = getFirestore();
} catch (err) {
  console.error(
    'Could not load serviceAccountKey.json — generate a private key in Firebase Console → ' +
    'Project settings → Service accounts and save it next to this script.\n' + (err.message ?? err),
  );
  process.exit(1);
}

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
