// OAuth 2.1 for the hosted Atlas MCP server, so apps that only connect by OAuth (the Gemini
// app, Claude's custom connectors, ChatGPT) can reach it. Follows the MCP authorization spec:
//
//   GET  /.well-known/oauth-protected-resource      which authorization server guards /mcp
//   GET  /.well-known/oauth-authorization-server    endpoints and what they support
//   POST /oauth/register     dynamic client registration (RFC 7591)
//   GET  /oauth/client       the consent page asks who is asking (name, AI guess)
//   POST /oauth/approve      the consent page, signed in as the owner, approves or denies
//   POST /oauth/token        authorization code (PKCE S256 required) or refresh token
//
// The consent page itself is the app's /oauth/authorize route (src/oauth/Consent.tsx), behind
// the same Google sign-in as the notes: only the account with the atlasOwner claim can approve.
// The owner also picks which AI the connection is, which labels its turns and flags.
// Codes and tokens are random strings stored only as SHA-256 hashes, in Firestore collections
// the app's security rules don't open: oauthClients, oauthCodes, oauthTokens.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { AI_IDS, isAi, type AiId } from "../src/lib/personas.ts";

const CODE_TTL = 5 * 60 * 1000;
const ACCESS_TTL = 60 * 60 * 1000;
const REFRESH_TTL = 90 * 24 * 60 * 60 * 1000;
const MAX_CLIENTS = 100;

export interface OAuthClient {
  name: string;
  redirectUris: string[];
  /** "none" for public clients (PKCE only); otherwise a hashed secret is required at /token. */
  authMethod: "none" | "client_secret_post" | "client_secret_basic";
  secretHash?: string;
  createdAt: string;
  revokedAt?: string;
  /** The AI the owner chose when approving it. */
  ai?: AiId;
  lastUsedAt?: string;
}

interface StoredToken {
  type: "access" | "refresh";
  clientId: string;
  ai: AiId;
  uid: string;
  expiresAt: number;
  revokedAt?: string;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const random = (prefix: string, bytes = 32) => `${prefix}${randomBytes(bytes).toString("base64url")}`;
const b64url = (buf: Buffer) => buf.toString("base64url");

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}
const oauthError = (res: ServerResponse, status: number, error: string, description: string) =>
  json(res, status, { error, error_description: description });

/** A redirect URI a client may register: https, or http on this computer for local tools. */
export function allowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** Which AI a client probably is, from where it wants the code sent. The owner confirms it. */
export function guessAi(redirectUri: string, name = ""): AiId | null {
  let host = "";
  try {
    host = new URL(redirectUri).hostname;
  } catch {
    return null;
  }
  const n = name.toLowerCase();
  if (/(^|\.)claude\.(ai|com)$/.test(host) || /(^|\.)anthropic\.com$/.test(host) || n.includes("claude"))
    return "claudeapp";
  if (/(^|\.)googleusercontent\.com$/.test(host) || /(^|\.)google\.com$/.test(host) || n.includes("gemini"))
    return "gemini";
  if (/(^|\.)(chatgpt|openai)\.com$/.test(host) || n.includes("chatgpt") || n.includes("openai")) return "chatgpt";
  if (n.includes("grok") || /(^|\.)x\.ai$/.test(host)) return "grok";
  return null;
}

/** RFC 7636 S256: base64url(sha256(verifier)) === challenge. */
export function pkceOk(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier ?? "")) return false;
  const a = Buffer.from(b64url(createHash("sha256").update(verifier).digest()));
  const b = Buffer.from(String(challenge ?? ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<Record<string, string>> {
  // Cloud Functions has already parsed JSON and form bodies.
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body as Record<string, string>;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 100_000) throw new Error("Body too large");
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if ((req.headers["content-type"] ?? "").includes("application/json")) return text ? JSON.parse(text) : {};
  return Object.fromEntries(new URLSearchParams(text));
}

/** The client credentials a /token request presents: Basic header or form fields. */
function clientCredentials(req: IncomingMessage, body: Record<string, string>) {
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.authorization ?? "");
  if (basic) {
    const [id, secret] = Buffer.from(basic[1], "base64").toString("utf8").split(":");
    return { id: decodeURIComponent(id ?? ""), secret: decodeURIComponent(secret ?? "") };
  }
  return { id: body.client_id ?? "", secret: body.client_secret ?? "" };
}

export interface OAuthOptions {
  fs: Firestore;
  auth: Auth;
  /** The public origin, e.g. https://recall-atlas-511913.web.app */
  base: string;
}

export const resourceMetadataUrl = (base: string) => `${base}/.well-known/oauth-protected-resource`;

/** Handles an OAuth route; returns false when the path isn't one. */
export function oauthHandler({ fs, auth, base }: OAuthOptions) {
  const clients = fs.collection("oauthClients");

  async function client(id: string): Promise<(OAuthClient & { id: string }) | null> {
    if (!/^[A-Za-z0-9_-]{10,80}$/.test(id ?? "")) return null;
    const snap = await clients.doc(id).get();
    const c = snap.data() as OAuthClient | undefined;
    return c && !c.revokedAt ? { ...c, id } : null;
  }

  async function issue(clientId: string, ai: AiId, uid: string) {
    const access = random("atlas_at_");
    const refresh = random("atlas_rt_");
    const now = Date.now();
    const batch = fs.batch();
    batch.set(fs.doc(`oauthTokens/${hash(access)}`), {
      type: "access",
      clientId,
      ai,
      uid,
      expiresAt: now + ACCESS_TTL,
    } satisfies StoredToken);
    batch.set(fs.doc(`oauthTokens/${hash(refresh)}`), {
      type: "refresh",
      clientId,
      ai,
      uid,
      expiresAt: now + REFRESH_TTL,
    } satisfies StoredToken);
    batch.update(clients.doc(clientId), { lastUsedAt: new Date(now).toISOString() });
    await batch.commit();
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: ACCESS_TTL / 1000,
      refresh_token: refresh,
      scope: "atlas",
    };
  }

  return async (req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", base);
    const path = url.pathname;

    if (req.method === "GET" && path.startsWith("/.well-known/oauth-protected-resource")) {
      json(res, 200, {
        resource: `${base}/mcp`,
        authorization_servers: [base],
        bearer_methods_supported: ["header"],
        scopes_supported: ["atlas"],
        resource_name: "Mains Atlas",
      });
      return true;
    }
    if (
      req.method === "GET" &&
      (path.startsWith("/.well-known/oauth-authorization-server") ||
        path.startsWith("/.well-known/openid-configuration"))
    ) {
      json(res, 200, {
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        registration_endpoint: `${base}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
        scopes_supported: ["atlas"],
      });
      return true;
    }

    if (path === "/oauth/register" && req.method === "POST") {
      const body = (await readBody(req)) as unknown as {
        redirect_uris?: unknown;
        client_name?: unknown;
        token_endpoint_auth_method?: unknown;
      };
      const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
      if (!uris.length || uris.length > 10 || !uris.every((u) => u.length < 500 && allowedRedirect(u)))
        return (oauthError(res, 400, "invalid_redirect_uri", "Give 1–10 https redirect URIs"), true);
      const method = String(body.token_endpoint_auth_method ?? "client_secret_basic");
      if (!["none", "client_secret_post", "client_secret_basic"].includes(method))
        return (oauthError(res, 400, "invalid_client_metadata", "Unsupported token_endpoint_auth_method"), true);
      if ((await clients.count().get()).data().count >= MAX_CLIENTS)
        return (oauthError(res, 400, "invalid_client_metadata", "Too many registered clients"), true);
      const id = random("atlas_c_", 18);
      const secret = method === "none" ? undefined : random("atlas_cs_");
      const record: OAuthClient = {
        name: String(body.client_name ?? "MCP client").slice(0, 80),
        redirectUris: uris,
        authMethod: method as OAuthClient["authMethod"],
        ...(secret ? { secretHash: hash(secret) } : {}),
        createdAt: new Date().toISOString(),
      };
      await clients.doc(id).set(record);
      json(res, 201, {
        client_id: id,
        ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: record.name,
        redirect_uris: uris,
        token_endpoint_auth_method: method,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      });
      return true;
    }

    if (path === "/oauth/client" && req.method === "GET") {
      const c = await client(url.searchParams.get("client_id") ?? "");
      const redirect = url.searchParams.get("redirect_uri") ?? "";
      if (!c || !c.redirectUris.includes(redirect))
        return (oauthError(res, 400, "invalid_request", "Unknown app or redirect address"), true);
      json(res, 200, {
        name: c.name,
        host: new URL(redirect).host,
        ai: c.ai ?? guessAi(redirect, c.name),
        ais: AI_IDS,
      });
      return true;
    }

    if (path === "/oauth/approve" && req.method === "POST") {
      // Only the app's own page may call this (it sends its Origin), signed in as the owner.
      if (req.headers.origin !== base) return (oauthError(res, 403, "access_denied", "Wrong origin"), true);
      const b = await readBody(req);
      const c = await client(b.client_id);
      if (!c || !c.redirectUris.includes(b.redirect_uri))
        return (oauthError(res, 400, "invalid_request", "Unknown app or redirect address"), true);
      const back = new URL(b.redirect_uri);
      if (b.state) back.searchParams.set("state", b.state);
      if (b.decision !== "allow") {
        back.searchParams.set("error", "access_denied");
        return (json(res, 200, { redirect: back.toString() }), true);
      }
      let uid = "";
      try {
        const token = await auth.verifyIdToken(String(b.id_token ?? ""), true);
        if (token.atlasOwner !== true) throw new Error("not the owner");
        uid = token.uid;
      } catch {
        return (oauthError(res, 403, "access_denied", "Only the owner's account can approve"), true);
      }
      if (b.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(b.code_challenge ?? ""))
        return (oauthError(res, 400, "invalid_request", "PKCE (S256) is required"), true);
      if (!isAi(b.ai)) return (oauthError(res, 400, "invalid_request", "Choose which AI this is"), true);
      const code = random("atlas_code_");
      await fs.doc(`oauthCodes/${hash(code)}`).set({
        clientId: c.id,
        redirectUri: b.redirect_uri,
        challenge: b.code_challenge,
        ai: b.ai,
        uid,
        expiresAt: Date.now() + CODE_TTL,
      });
      await clients.doc(c.id).update({ ai: b.ai });
      back.searchParams.set("code", code);
      json(res, 200, { redirect: back.toString() });
      return true;
    }

    if (path === "/oauth/token" && req.method === "POST") {
      const b = await readBody(req);
      const cred = clientCredentials(req, b);
      const c = await client(cred.id);
      if (!c) return (oauthError(res, 401, "invalid_client", "Unknown or revoked client"), true);
      if (c.authMethod !== "none") {
        const given = Buffer.from(hash(cred.secret ?? ""));
        if (!c.secretHash || !timingSafeEqual(given, Buffer.from(c.secretHash)))
          return (oauthError(res, 401, "invalid_client", "Wrong client secret"), true);
      }
      if (b.grant_type === "authorization_code") {
        const ref = fs.doc(`oauthCodes/${hash(String(b.code ?? ""))}`);
        const code = await fs.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists) tx.delete(ref); // single use
          return snap.data() as
            | { clientId: string; redirectUri: string; challenge: string; ai: AiId; uid: string; expiresAt: number }
            | undefined;
        });
        if (!code || code.expiresAt < Date.now() || code.clientId !== c.id || code.redirectUri !== b.redirect_uri)
          return (oauthError(res, 400, "invalid_grant", "Code is wrong, used or expired"), true);
        if (!pkceOk(String(b.code_verifier ?? ""), code.challenge))
          return (oauthError(res, 400, "invalid_grant", "PKCE check failed"), true);
        json(res, 200, await issue(c.id, code.ai, code.uid));
        return true;
      }
      if (b.grant_type === "refresh_token") {
        const ref = fs.doc(`oauthTokens/${hash(String(b.refresh_token ?? ""))}`);
        const t = (await ref.get()).data() as StoredToken | undefined;
        if (!t || t.type !== "refresh" || t.revokedAt || t.expiresAt < Date.now() || t.clientId !== c.id)
          return (oauthError(res, 400, "invalid_grant", "Refresh token is wrong, revoked or expired"), true);
        await ref.update({ revokedAt: new Date().toISOString() }); // rotate
        json(res, 200, await issue(c.id, t.ai, t.uid));
        return true;
      }
      return (oauthError(res, 400, "unsupported_grant_type", "Use authorization_code or refresh_token"), true);
    }
    return false;
  };
}

/** For the MCP endpoint: the AI an OAuth access token belongs to, or null. */
export function oauthTokenChecker(fs: Firestore) {
  return async (token: string): Promise<AiId | null> => {
    if (!/^atlas_at_[A-Za-z0-9_-]{20,}$/.test(token)) return null;
    const t = (await fs.doc(`oauthTokens/${hash(token)}`).get()).data() as StoredToken | undefined;
    if (!t || t.type !== "access" || t.revokedAt || t.expiresAt < Date.now() || !isAi(t.ai)) return null;
    const c = (await fs.doc(`oauthClients/${t.clientId}`).get()).data() as OAuthClient | undefined;
    return c && !c.revokedAt ? t.ai : null;
  };
}

export async function listClients(fs: Firestore) {
  return (await fs.collection("oauthClients").get()).docs.map((d) => ({ id: d.id, ...(d.data() as OAuthClient) }));
}

/** Revokes a client (by id or the start of it) and every token issued to it. */
export async function revokeClient(fs: Firestore, idPrefix: string): Promise<OAuthClient | null> {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(idPrefix)) return null;
  const hits = (await fs.collection("oauthClients").get()).docs.filter((d) => d.id.startsWith(idPrefix));
  if (hits.length !== 1) return null;
  const at = new Date().toISOString();
  await hits[0].ref.update({ revokedAt: at });
  const tokens = await fs.collection("oauthTokens").where("clientId", "==", hits[0].id).get();
  for (const t of tokens.docs) await t.ref.update({ revokedAt: at });
  return { ...(hits[0].data() as OAuthClient), revokedAt: at };
}
