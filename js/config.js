// ══════════════════════════════════════════════════════
// NexBoost — Firebase & App Configuration
// Replace firebaseConfig with your project credentials.
// ══════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ── App settings ──────────────────────────────────────
const APP = {
  name:     "NexBoost",
  tagline:  "Panel SMM Profesional",
  currency: "USD",
  markup:   1.5,
};

// ── Provider API — routed through Cloudflare Worker ──
const PROVIDER = {
  url: "https://nexboost-api.nextboostdgp.workers.dev",
};

// ── Firebase init ─────────────────────────────────────
firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();