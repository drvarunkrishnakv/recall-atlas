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
import { loadContent } from "../content/store";
import { refreshStudy } from "../content/study";
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

/** Opens the notes for `u`, or shows why not. */
async function admit(u: User, setGate: (g: Gate) => void) {
  setGate("checking");
  if (!(await canRead(u))) return setGate("refused");
  setGate("open");
  void loadContent();
  void refreshStudy();
}

/** Signs out and wipes this device's offline copy of the notes. */
export async function signOutAndClear() {
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
    getRedirectResult(auth).catch((e) => setError(signInMessage(e)));
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) void admit(u, setGate);
      else setGate("signed-out");
    });
  }, []);

  if (gate === "open") return children;

  const signIn = async () => {
    setError("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    // Home-screen apps can't open a popup; they sign in by redirect instead.
    if (matchMedia("(display-mode: standalone)").matches) return signInWithRedirect(auth, provider);
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
          <p className="loading">{gate === "checking" ? "Opening your notes…" : "Starting…"}</p>
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
