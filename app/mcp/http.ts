// The Atlas MCP server over HTTP (Streamable HTTP, stateless, JSON responses), shared by the
// hosted Cloud Function and `atlas-mcp.ts --http` on this Mac. Every request needs a key or an
// OAuth access token ("Authorization: Bearer <…>", or "X-API-Key: <key>" for clients that only
// offer an API-key field); it decides which AI is calling. Browser requests (with an Origin)
// are refused.
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Backend } from "../server/backend.ts";
import type { AiId } from "../src/lib/personas.ts";
import { buildServer } from "./server.ts";

export interface McpHttpOptions {
  db: Backend;
  /** The AI a key or OAuth access token belongs to, or null for a wrong, expired or revoked one. */
  checkKey: (key: string) => Promise<AiId | null>;
  /** Where OAuth clients find how to sign in (sent on a 401, per the MCP authorization spec). */
  resourceMetadata?: string;
}

function deny(res: ServerResponse, status: number, msg: string, headers: Record<string, string> = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: msg }));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new Error("Body too large");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * Handles one request to /mcp. `body` is the parsed JSON when the host has already read it
 * (Cloud Functions does); otherwise it is read here.
 */
export async function handleMcp(
  { db, checkKey, resourceMetadata }: McpHttpOptions,
  req: IncomingMessage,
  res: ServerResponse,
  body?: unknown,
) {
  if (req.headers.origin) return deny(res, 403, "Browser requests are not accepted");
  const apiKey = req.headers["x-api-key"];
  const key = typeof apiKey === "string" ? apiKey : (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const ai = key ? await checkKey(key.trim()) : null;
  if (!ai)
    return deny(
      res,
      401,
      "Missing or wrong key",
      resourceMetadata ? { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}"` } : {},
    );
  if (req.method !== "POST") return deny(res, 405, "Use POST");
  let message = body;
  if (message === undefined)
    try {
      message = await readJson(req);
    } catch {
      return deny(res, 400, "Bad JSON");
    }
  const server = buildServer(db, { ai });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, message);
}
