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
  // Default markup over provider cost (e.g. 1.5 = 50% margin).
  // Can be overridden per-service from admin panel.
  markup:   1.5,
};

// ── Provider API (JustAnotherPanel-compatible) ────────
// Store the real key in Firestore > settings/main.smmApiKey
// to keep it out of public source code.
const PROVIDER = {
  url: "https://justanotherpanel.com/api/v2",  // swap for any JAP-compatible panel
  // key is loaded from Firestore at runtime by admin setup
};

// ── Firebase init ─────────────────────────────────────
firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();
