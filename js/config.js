const firebaseConfig = {
  apiKey:            "AIzaSyAnsIyEC_8LgnR7S98RwBkxB1vB3dWToc8",
  authDomain:        "nextboost-76d23.firebaseapp.com",
  projectId:         "nextboost-76d23",
  storageBucket:     "nextboost-76d23.firebasestorage.app",
  messagingSenderId: "903563165127",
  appId:             "1:903563165127:web:0af17e02279da5919d2de2"
};

const APP = {
  name:     "NextBoost",
  tagline:  "Panel SMM Profesional",
  currency: "USD",
  markup:   1.5,
};

const PROVIDER = {
  url: "https://nexboost-api.nextboostdgp.workers.dev",
};

firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();