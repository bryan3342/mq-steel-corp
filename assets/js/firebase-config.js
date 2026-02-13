/* ===========================================================
   firebase-config.js — Firebase Project Configuration

   Initializes Firebase and creates a Firestore database
   instance using the modular SDK v12 (ES module imports
   from CDN — no npm/bundler needed).

   The config values below are client-side identifiers
   (not secrets). Security is enforced by Firestore
   Security Rules, not by hiding these keys.
   =========================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

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
export const db = getFirestore(app);
