// The cloud build's front door. Signed out, you see only the sign-in button; signed in with
// the owner's Google account, the notes load. Firestore rules are what actually keep the
// notes private (only the account with the `atlasOwner` claim can read them); this screen
// just explains a refusal and shows the account id the owner claim is set on.
import { useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { clearIndexedDbPersistence, doc, getDoc, terminate } from "firebase/firestore";
import { auth, db, firebaseConfigured } from "../content/firebase";
import { loadContent, paintFromSnapshot } from "../content/store";
import { paintStudyFromSnapshot, refreshStudy } from "../content/study";
import { clearSnapshot, setSnapshotOwner, snapshotOwner } from "../content/snapshot";
import { Icon } from "./Icon";

type Gate = "starting" | "signed-out" | "checking" | "refused" | "open";

const code = (e: unknown) => (e as { code?: string })?.code ?? "";

/** Can this account read the notes? Re-checks once with a fresh token, in case the owner claim was just set. */
async function canRead(user: User): Promise<boolean> {
  for (const fresh of [false, true]) {
    if (fresh) await user.getIdToken(true);
    try {
      await getDoc(doc(db, "study", "progress"));
      return true;
    } catch (e) {
      if (code(e) !== "permission-denied") return true; // offline: open with what's cached
    }
  }
  return false;
}

/** Opens the notes for `u`, or shows why not. `quiet`: the kept copy is already showing. */
async function admit(u: User, setGate: (g: Gate) => void, quiet = false) {
  if (!quiet) setGate("checking");
  // Keep what loads for an instant start next time; wiped below if this account can't read.
  setSnapshotOwner(u.uid);
  // Start fetching the notes alongside the read check rather than after it: one round trip
  // fewer before the first page shows. If the check refuses, these reads are refused too.
  void loadContent();
  void refreshStudy();
  if (!(await canRead(u))) {
    await clearSnapshot();
    return setGate("refused");
  }
  setGate("open");
  // Usually the same load still in flight; a fresh one if it was refused before the token caught up.
  void loadContent();
}

/** Signs out and wipes this device's offline copy of the notes. */
export async function signOutAndClear() {
  await clearSnapshot();
  await signOut(auth);
  await terminate(db);
  await clearIndexedDbPersistence(db).catch(() => undefined);
  location.assign("/");
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>("starting");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // Signed in here before? Show the notes this device kept while Firebase confirms the
    // account (a second or more); a signed-out, refused or different account wipes the copy.
    const owner = snapshotOwner();
    if (owner)
      void Promise.all([paintFromSnapshot(), paintStudyFromSnapshot()]).then(
        ([painted]) => painted && setGate((g) => (g === "starting" ? "open" : g)),
      );
    getRedirectResult(auth).catch((e) => setError(signInMessage(e)));
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        if (owner) void clearSnapshot();
        return setGate("signed-out");
      }
      if (owner && owner !== u.uid) void clearSnapshot();
      void admit(u, setGate, owner === u.uid);
    });
  }, []);

  if (gate === "open") return children;

  const signIn = async () => {
    setError("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    // A popup everywhere except an iPhone or iPad home-screen app, where it would open in
    // Safari, outside the app's storage. On Android a redirect from the home-screen app can come
    // back in another window that has lost the pending sign-in, so it uses the popup too.
    const appleDevice =
      /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
    if (appleDevice && matchMedia("(display-mode: standalone)").matches) return signInWithRedirect(auth, provider);
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (code(e) === "auth/popup-blocked") return signInWithRedirect(auth, provider);
      if (code(e) !== "auth/popup-closed-by-user" && code(e) !== "auth/cancelled-popup-request")
        setError(signInMessage(e));
    }
  };

  return (
    <main className="signin">
      <div className="signin-card">
        <span className="logo" aria-hidden="true">
          <Icon name="atlas" />
        </span>
        <h1>Mains Atlas</h1>
        {!firebaseConfigured ? (
          <p>This build has no Firebase settings. Fill in app/.env.local (see app/.env.example) and build again.</p>
        ) : gate === "signed-out" ? (
          <>
            <p>Your revision notes. Sign in with the Google account they belong to.</p>
            <button type="button" className="signin-btn" onClick={() => void signIn()}>
              Sign in with Google
            </button>
          </>
        ) : gate === "refused" ? (
          <>
            <p>
              <b>{user?.email}</b> can't open these notes.
            </p>
            <p className="signin-small">
              If this is your account, mark it as the owner: <code>npm run atlas -- owner {user?.uid}</code>, then try
              again.
            </p>
            <div className="signin-row">
              <button type="button" className="signin-btn" onClick={() => user && void admit(user, setGate)}>
                Try again
              </button>
              <button type="button" className="signin-quiet" onClick={() => void signOutAndClear()}>
                Use another account
              </button>
            </div>
          </>
        ) : (
          <p className="loading shimmer-text" role="status">
            {gate === "checking" ? "Opening your notes…" : "Starting…"}
          </p>
        )}
        {error && <p className="signin-error">{error}</p>}
      </div>
    </main>
  );
}

function signInMessage(e: unknown): string {
  const c = code(e);
  if (c === "auth/network-request-failed") return "No connection. Sign in once you're online.";
  if (c === "auth/unauthorized-domain") return `Sign-in isn't allowed on ${location.hostname} yet.`;
  return `Sign-in failed (${c || String(e)}).`;
}
