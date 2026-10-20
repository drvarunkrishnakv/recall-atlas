// Firebase Storage for the cloud build: the page photos of Mains answers (M8), under owner-only
// rules (storage.rules). Loaded only when a photo is sent or shown, so the rest of the app
// doesn't carry it. The bucket comes from the web config (VITE_FIREBASE_STORAGE_BUCKET).
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { firebaseApp } from "./firebase";

export const storage = getStorage(firebaseApp);

// Local testing against the Firebase emulators (VITE_FIREBASE_EMULATORS=1).
if (import.meta.env.VITE_FIREBASE_EMULATORS === "1") connectStorageEmulator(storage, "127.0.0.1", 9199);
