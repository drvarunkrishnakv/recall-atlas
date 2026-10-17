// Settings (/settings, the gear at the foot of the sidebar): the theme, and in the cloud build
// the signed-in account with Sign out. Kept small; new settings join here, not the top bar.
import { useEffect, useState } from "react";
import { ThemeSetting } from "./components/ThemeToggle";
import { Icon } from "./components/Icon";

function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Mains Atlas`;
  }, [title]);
}

const CLOUD = import.meta.env.MODE === "cloud";

export function SettingsPage() {
  useTitle("Settings");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!CLOUD) return;
    void import("./content/firebase").then(({ auth }) => setEmail(auth.currentUser?.email ?? ""));
  }, []);

  return (
    <article className="dash settings">
      <header className="dash-head">
        <div>
          <div className="eyebrow">This device and your account</div>
          <h1>Settings</h1>
        </div>
      </header>

      <section className="settings-sec">
        <h2 className="sec-h">Appearance</h2>
        <div className="settings-row">
          <div>
            <b>Theme</b>
            <p className="muted">System follows your device. Saved on this device only.</p>
          </div>
          <ThemeSetting />
        </div>
      </section>

      {CLOUD && (
        <section className="settings-sec">
          <h2 className="sec-h">Account</h2>
          <div className="settings-row">
            <div>
              <b>{email || "Signed in"}</b>
              <p className="muted">Signing out also clears this device's offline copy of your notes.</p>
            </div>
            <button
              type="button"
              className="settings-signout"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void import("./components/AuthGate").then((m) => m.signOutAndClear());
              }}
            >
              <Icon name="signout" />
              Sign out
            </button>
          </div>
        </section>
      )}
    </article>
  );
}
