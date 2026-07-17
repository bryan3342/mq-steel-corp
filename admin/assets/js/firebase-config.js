import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app-check.js";

// Same Firebase project as the public marketing site (mq-steel-corp).
// These are PUBLIC identifiers — access is enforced by Firestore rules + Auth, not secrecy.
const firebaseConfig = {
  apiKey:            "AIzaSyAONLzAI8fh6TJq_84gXvhdU5TvM23g73I",
  authDomain:        "mq-steel-corp.firebaseapp.com",
  projectId:         "mq-steel-corp",
  storageBucket:     "mq-steel-corp.firebasestorage.app",
  messagingSenderId: "900353658641",
  appId:             "1:900353658641:web:8e8c87b84e8077311886b0",
  measurementId:     "G-NBRN5F99L5"
};

const app = initializeApp(firebaseConfig);

// App Check — reuses the public site's reCAPTCHA v3 site key.
// IMPORTANT one-time setup: add THIS portal's domain to the key's allowed domains in the
// reCAPTCHA admin console, and register it under Firebase Console → App Check. Otherwise
// Firestore reads from here are blocked once App Check enforcement is on.
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LdijXAsAAAAAMx7IN8c6DQxnAHoRBBlRbn1clWy'),
  isTokenAutoRefreshEnabled: true,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
