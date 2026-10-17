// Firebase for the cloud build (`vite --mode cloud`): the app, Google sign-in and Firestore
// with an offline cache, so notes you've opened stay readable without a connection.
// The web config comes from app/.env.local (git-ignored); see app/.env.example.
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const env = import.meta.env;
const hostingDomain = /\.(web\.app|firebaseapp\.com)$/.test(location.hostname);

export const firebaseApp = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  // On Firebase Hosting, sign in through this same domain: phones and Safari block the
  // cross-site storage a redirect through another domain needs.
  authDomain: hostingDomain ? location.host : env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

export const auth = initializeAuth(firebaseApp, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});

export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Local testing against the Firebase emulators (VITE_FIREBASE_EMULATORS=1).
if (env.VITE_FIREBASE_EMULATORS === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export const firebaseConfigured = !!env.VITE_FIREBASE_API_KEY && !!env.VITE_FIREBASE_PROJECT_ID;
