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

// ── Provider API — routed through Cloudflare Worker ──
// The Worker holds the real JAP API key as a secret.
// The browser NEVER sees the JAP key.
//
// After deploying the worker, paste its URL here:
//   wrangler deploy  →  https://nexboost-api.<subdomain>.workers.dev
// Or with custom domain: https://api.nexboost.io
const PROVIDER = {
  url: "https://nexboost-api.YOUR_SUBDOMAIN.workers.dev",
};

// ── Firebase init ─────────────────────────────────────
firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();
