// The Atlas MCP server: how bots (Grok Bot, Claude, any MCP client) take part in a note's
// discussions — debate club, expert roundtable, devil's advocate. The tools are in server.ts.
//
//   node mcp/atlas-mcp.ts                 stdio, for a client that runs a command on this Mac
//   node mcp/atlas-mcp.ts --http 5190     HTTP on 127.0.0.1:5190/mcp, needs the bearer key
//   npm run mcp:build                     bundle into mcp/dist/atlas-mcp.mjs (one file starts in
//                                         a second; the SDK's many small files are slow on this drive)
//
// Reads and writes the same files as the dev save API (ATLAS_CONTENT_DIR). The HTTP key is
// ATLAS_MCP_KEY, or a random one kept in .atlas-local/mcp-key (git-ignored) and printed on start.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server.ts";

// The app folder: one up from mcp/, or two up from the bundle in mcp/dist/.
const here = dirname(fileURLToPath(import.meta.url));
const appRoot = existsSync(join(here, "..", "package.json")) ? join(here, "..") : join(here, "..", "..");
const dir = process.env.ATLAS_CONTENT_DIR ?? join(appRoot, ".atlas-local");
if (!existsSync(dir)) {
  console.error("Set ATLAS_CONTENT_DIR to the notes repo's content/ folder.");
  process.exit(1);
}

// ---------- transports ----------

function httpKey(): string {
  if (process.env.ATLAS_MCP_KEY) return process.env.ATLAS_MCP_KEY;
  const path = join(appRoot, ".atlas-local", "mcp-key");
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  mkdirSync(dirname(path), { recursive: true });
  const key = randomBytes(24).toString("base64url");
  writeFileSync(path, key + "\n", { mode: 0o600 });
  return key;
}

const portArg = process.argv.indexOf("--http");
if (portArg === -1) {
  await buildServer(dir).connect(new StdioServerTransport());
} else {
  const port = Number(process.argv[portArg + 1] ?? 5190);
  const key = Buffer.from(httpKey());
  // The key comes as "Authorization: Bearer <key>", or as "X-API-Key: <key>" for clients
  // that only offer an API-key field.
  const authorised = (bearer: string | undefined, apiKey: string | string[] | undefined) => {
    const given = Buffer.from(typeof apiKey === "string" ? apiKey : (bearer ?? "").replace(/^Bearer\s+/i, ""));
    return given.length === key.length && timingSafeEqual(given, key);
  };
  createServer(async (req, res) => {
    const deny = (status: number, msg: string) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: msg }));
    };
    if (new URL(req.url ?? "/", "http://local").pathname !== "/mcp") return deny(404, "Not found");
    // Browsers send an Origin; bots don't. Refusing browser pages stops a web page on this Mac
    // from talking to the server.
    if (req.headers.origin) return deny(403, "Browser requests are not accepted");
    if (!authorised(req.headers.authorization, req.headers["x-api-key"])) return deny(401, "Missing or wrong key");
    if (req.method !== "POST") return deny(405, "Use POST");
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > 1_000_000) return deny(413, "Body too large");
      chunks.push(c as Buffer);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return deny(400, "Bad JSON");
    }
    const server = buildServer(dir);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }).listen(port, "127.0.0.1", () => {
    console.error(`Atlas MCP on http://127.0.0.1:${port}/mcp`);
    console.error(`Bearer key: ${process.env.ATLAS_MCP_KEY ? "(from ATLAS_MCP_KEY)" : key.toString()}`);
  });
}
