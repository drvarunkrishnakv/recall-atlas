// The OAuth consent page (/oauth/authorize): an AI app such as the Gemini app or Claude asks to
// connect to the Atlas MCP server. It sits behind the app's Google sign-in, so only the owner
// gets here. The owner sees who is asking, picks which AI it is (that labels its turns and
// flags) and allows or denies. The server (server/oauth.ts) checks everything again.
import { useEffect, useState } from "react";
import { AIS, isAi, type AiId } from "../lib/personas";
import { Icon } from "../components/Icon";

interface ClientInfo {
  name: string;
  host: string;
  ai: AiId | null;
  ais: AiId[];
}

export default function Consent() {
  const params = new URLSearchParams(location.search);
  const [info, setInfo] = useState<ClientInfo | null>(null);
  const [ai, setAi] = useState<AiId | "">("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const bad =
    params.get("response_type") !== "code"
      ? "This sign-in link is missing its response type."
      : params.get("code_challenge_method") !== "S256" || !params.get("code_challenge")
        ? "This app didn't use PKCE, which Atlas requires."
        : "";

  useEffect(() => {
    if (bad) return;
    const q = new URLSearchParams({
      client_id: params.get("client_id") ?? "",
      redirect_uri: params.get("redirect_uri") ?? "",
    });
    fetch(`/oauth/client?${q}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error_description ?? "Unknown app");
        setInfo(body);
        if (isAi(body.ai)) setAi(body.ai);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // The query string is fixed for the life of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = async (decision: "allow" | "deny") => {
    setBusy(true);
    setError("");
    try {
      const { auth } = await import("../content/firebase");
      const idToken = await auth.currentUser?.getIdToken();
      const r = await fetch("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          ai,
          id_token: idToken,
          client_id: params.get("client_id"),
          redirect_uri: params.get("redirect_uri"),
          state: params.get("state") ?? "",
          code_challenge: params.get("code_challenge"),
          code_challenge_method: params.get("code_challenge_method"),
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error_description ?? "Couldn't approve");
      // A plain navigation back to the app (not a form post), which Google's relay accepts.
      location.assign(body.redirect);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <main className="signin">
      <div className="signin-card consent">
        <span className="logo" aria-hidden="true">
          <Icon name="atlas" />
        </span>
        <h1>Connect to Mains Atlas</h1>
        {bad || (error && !info) ? (
          <p className="signin-error">{bad || error}</p>
        ) : !info ? (
          <p className="loading">Checking the app…</p>
        ) : (
          <>
            <p>
              <b>{info.name}</b> wants to use your notes. You'll go back to <b>{info.host}</b>.
            </p>
            <ul className="consent-can">
              <li>Read your notes, concept cards and discussions, and search them</li>
              <li>Take its own turns in discussions, and flag passages for Claude to check</li>
              <li>It can't edit or delete notes, comments or anything else</li>
            </ul>
            <label className="consent-ai">
              This app is
              <select value={ai} onChange={(e) => setAi(e.target.value as AiId)}>
                <option value="" disabled>
                  Choose…
                </option>
                {info.ais.map((id) => (
                  <option key={id} value={id}>
                    {AIS[id].name}
                  </option>
                ))}
              </select>
            </label>
            <div className="signin-row">
              <button type="button" className="signin-btn" disabled={busy || !ai} onClick={() => void decide("allow")}>
                Allow
              </button>
              <button type="button" className="signin-quiet" disabled={busy} onClick={() => void decide("deny")}>
                Deny
              </button>
            </div>
            <p className="signin-small">Turn it off any time: npm run atlas -- oauth revoke &lt;id&gt;</p>
          </>
        )}
        {error && info && <p className="signin-error">{error}</p>}
      </div>
    </main>
  );
}
