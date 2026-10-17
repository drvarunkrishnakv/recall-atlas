// OAuth for the hosted MCP server, end to end against the Firestore and Auth emulators
// (npm run test:cloud): discovery, registration, the owner's approval, PKCE, tokens, refresh,
// revocation, and an MCP call made with the access token.
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { adminApp, firestoreBackend } from "./firestore-backend.ts";
import { keyChecker } from "./mcp-keys.ts";
import { oauthHandler, oauthTokenChecker, pkceOk, resourceMetadataUrl, revokeClient } from "./oauth.ts";
import { handleMcp } from "../mcp/http.ts";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-atlas";
const fsHost = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const app = adminApp();
const fs = getFirestore(app);
const auth = getAuth(app);
let server: Server;
let base = "";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");

/** An ID token for a user, as the app's Google sign-in would give, from the Auth emulator. */
async function idToken(uid: string, claims: Record<string, unknown>) {
  const custom = await auth.createCustomToken(uid, claims);
  const r = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    },
  );
  return ((await r.json()) as { idToken: string }).idToken;
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const form = (path: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body).toString(),
  });

let clientId = "";

async function approve(token: string, extra: Record<string, string> = {}) {
  return post(
    "/oauth/approve",
    {
      decision: "allow",
      ai: "claudeapp",
      id_token: token,
      client_id: clientId,
      redirect_uri: CALLBACK,
      state: "xyz",
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...extra,
    },
    { Origin: base },
  );
}

beforeAll(async () => {
  await fetch(`http://${fsHost}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  const db = firestoreBackend(fs);
  await db.restore({
    pages: [
      {
        collection: "notes",
        id: "P1",
        title: "Test note",
        version: 1,
        updated: "",
        blocks: [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "Hello." }] }],
      },
    ],
    threads: {},
    discussions: {},
    progress: { notes: {} },
    captures: [],
  });
  server = createServer();
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const oauth = oauthHandler({ fs, auth, base });
  const byKey = keyChecker(fs, 0);
  const byToken = oauthTokenChecker(fs);
  const checkKey = async (k: string) => (k.startsWith("atlas_at_") ? byToken(k) : byKey(k));
  server.on("request", async (req, res) => {
    if (await oauth(req, res)) return;
    await handleMcp({ db, checkKey, resourceMetadata: resourceMetadataUrl(base) }, req, res);
  });
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

describe("OAuth for the MCP server", () => {
  it("publishes its metadata, and an MCP call without a token points to it", async () => {
    const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(prm).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [base] });
    const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(as).toMatchObject({
      registration_endpoint: `${base}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
    });
    const r = await post("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain(resourceMetadataUrl(base));
  });

  it("registers a client, but only with https (or localhost) redirects", async () => {
    expect((await post("/oauth/register", { redirect_uris: ["http://evil.example/cb"] })).status).toBe(400);
    const r = await post("/oauth/register", {
      redirect_uris: [CALLBACK],
      client_name: "Claude",
      token_endpoint_auth_method: "none",
    });
    expect(r.status).toBe(201);
    clientId = ((await r.json()) as { client_id: string }).client_id;
    const info = await (
      await fetch(`${base}/oauth/client?${new URLSearchParams({ client_id: clientId, redirect_uri: CALLBACK })}`)
    ).json();
    expect(info).toMatchObject({ name: "Claude", host: "claude.ai", ai: "claudeapp" });
    expect(
      (
        await fetch(
          `${base}/oauth/client?${new URLSearchParams({ client_id: clientId, redirect_uri: "https://x.example/cb" })}`,
        )
      ).status,
    ).toBe(400);
  });

  it("lets only the owner approve, only from the app's own page", async () => {
    const owner = await idToken("owner-uid", { atlasOwner: true });
    const stranger = await idToken("someone", {});
    expect((await post("/oauth/approve", { client_id: clientId }, {})).status).toBe(403); // no Origin
    expect((await approve(stranger)).status).toBe(403);
    expect((await approve(owner, { code_challenge_method: "plain" })).status).toBe(400);
    const deny = (await (await approve(owner, { decision: "deny" })).json()) as { redirect: string };
    expect(new URL(deny.redirect).searchParams.get("error")).toBe("access_denied");
  });

  it("exchanges a code once with the right PKCE verifier, then the token works for MCP", async () => {
    const owner = await idToken("owner-uid", { atlasOwner: true });
    const { redirect } = (await (await approve(owner)).json()) as { redirect: string };
    const back = new URL(redirect);
    expect(back.origin + back.pathname).toBe(CALLBACK);
    expect(back.searchParams.get("state")).toBe("xyz");
    const code = back.searchParams.get("code")!;
    const grant = { grant_type: "authorization_code", code, redirect_uri: CALLBACK, client_id: clientId };

    const wrong = await form("/oauth/token", { ...grant, code_verifier: randomBytes(32).toString("base64url") });
    expect(wrong.status).toBe(400); // and the code is now spent
    const { redirect: again } = (await (await approve(owner)).json()) as { redirect: string };
    const code2 = new URL(again).searchParams.get("code")!;
    const ok = await form("/oauth/token", { ...grant, code: code2, code_verifier: verifier });
    expect(ok.status).toBe(200);
    const tokens = (await ok.json()) as { access_token: string; refresh_token: string };
    expect((await form("/oauth/token", { ...grant, code: code2, code_verifier: verifier })).status).toBe(400);

    const init = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
      },
      { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json, text/event-stream" },
    );
    expect(init.status).toBe(200);
    expect(JSON.stringify(await init.json())).toContain("You are connected as Claude app");

    // Refresh rotates: the new pair works, the old refresh token doesn't.
    const refreshed = await form("/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
    });
    expect(refreshed.status).toBe(200);
    expect(
      (
        await form("/oauth/token", {
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: clientId,
        })
      ).status,
    ).toBe(400);

    // Revoking the app turns off every token it holds.
    const fresh = (await refreshed.json()) as { access_token: string };
    expect(await revokeClient(fs, clientId.slice(0, 12))).toMatchObject({ name: "Claude" });
    expect(await oauthTokenChecker(fs)(fresh.access_token)).toBeNull();
  });

  it("requires the secret from a confidential client", async () => {
    const r = await post("/oauth/register", { redirect_uris: [CALLBACK], client_name: "Gemini" });
    const c = (await r.json()) as { client_id: string; client_secret: string };
    expect(c.client_secret).toBeTruthy();
    const basic = (secret: string) => `Basic ${Buffer.from(`${c.client_id}:${secret}`).toString("base64")}`;
    const t = (secret: string) =>
      form(
        "/oauth/token",
        { grant_type: "refresh_token", refresh_token: "atlas_rt_x" },
        { Authorization: basic(secret) },
      );
    expect((await t("wrong")).status).toBe(401);
    expect((await t(c.client_secret)).status).toBe(400); // right secret, bad refresh token
  });

  it("checks PKCE S256 exactly", () => {
    expect(pkceOk(verifier, challenge)).toBe(true);
    expect(pkceOk(verifier + "x", challenge)).toBe(false);
    expect(pkceOk("short", challenge)).toBe(false);
  });
});
