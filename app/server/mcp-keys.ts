// Keys for the Atlas MCP server, one per connected AI (Grok, Gemini, ChatGPT…). A key says
// which AI is calling, so its turns and flags are labelled with that AI. Only a SHA-256 hash
// is stored, in Firestore `mcpKeys/{hash}` (closed to the app by the security rules; the
// Admin SDK reads it). `atlas mcp-key add|list|revoke` manages them.
import { createHash, randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { isAi, type AiId } from "../src/lib/personas.ts";

export interface McpKey {
  ai: AiId;
  label: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Makes a new key for `ai` and returns it; it is shown once and never stored in plain text. */
export async function createKey(db: Firestore, ai: AiId, label: string): Promise<{ key: string; id: string }> {
  if (!isAi(ai)) throw new Error(`Unknown AI "${ai}"`);
  const key = `atlas_${ai}_${randomBytes(24).toString("base64url")}`;
  const hash = hashKey(key);
  await db.doc(`mcpKeys/${hash}`).set({ ai, label: label.slice(0, 80), createdAt: new Date().toISOString() });
  return { key, id: hash.slice(0, 8) };
}

export async function listKeys(db: Firestore): Promise<(McpKey & { id: string })[]> {
  return (await db.collection("mcpKeys").get()).docs.map((d) => ({ ...(d.data() as McpKey), id: d.id.slice(0, 8) }));
}

/** Revokes the key whose id (the first characters of its hash) is given. */
export async function revokeKey(db: Firestore, id: string): Promise<McpKey | null> {
  if (!/^[0-9a-f]{6,64}$/.test(id)) return null;
  const hit = (await db.collection("mcpKeys").get()).docs.filter((d) => d.id.startsWith(id));
  if (hit.length !== 1) return null;
  const revokedAt = new Date().toISOString();
  await hit[0].ref.update({ revokedAt });
  return { ...(hit[0].data() as McpKey), revokedAt };
}

/** Looks up a key for the server, with a short in-memory cache. Returns the AI it belongs to, or null. */
export function keyChecker(db: Firestore, cacheMs = 60_000) {
  const cache = new Map<string, { ai: AiId | null; at: number }>();
  return async (key: string): Promise<AiId | null> => {
    if (!/^atlas_[a-z]+_[A-Za-z0-9_-]{20,}$/.test(key)) return null;
    const hash = hashKey(key);
    const hit = cache.get(hash);
    if (hit && Date.now() - hit.at < cacheMs) return hit.ai;
    const snap = await db.doc(`mcpKeys/${hash}`).get();
    const data = snap.data() as McpKey | undefined;
    const ai = data && !data.revokedAt && isAi(data.ai) ? data.ai : null;
    cache.set(hash, { ai, at: Date.now() });
    if (ai) void snap.ref.update({ lastUsedAt: new Date().toISOString() }).catch(() => undefined);
    return ai;
  };
}
