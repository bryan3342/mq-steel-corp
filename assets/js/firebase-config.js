import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app-check.js";

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

// ─── App Check ────────────────────────────────────────────────────────────────
// Paste your reCAPTCHA v3 SITE KEY (public key) below.
// Get it from: https://www.google.com/recaptcha/admin/create
// Then enable enforcement in: Firebase Console → App Check → Firestore → Enforce
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LdijXAsAAAAAMx7IN8c6DQxnAHoRBBlRbn1clWy'),
  isTokenAutoRefreshEnabled: true,
});

export const db = getFirestore(app);
