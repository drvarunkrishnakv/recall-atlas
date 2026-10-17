// The Atlas MCP server on this Mac: how other AIs (Grok, Gemini, ChatGPT, any MCP client)
// take part in discussions and flag passages. The tools are in server.ts; the hosted server
// at a fixed address (Firebase) is in functions/ and shares http.ts.
//
//   node mcp/atlas-mcp.ts [--ai grok]          stdio, for a client that runs a command on this Mac
//   node mcp/atlas-mcp.ts --http 5190          HTTP on 127.0.0.1:5190/mcp, needs a key
//   npm run mcp:build                          bundle into mcp/dist/atlas-mcp.mjs (one file starts in
//                                              a second; the SDK's many small files are slow on this drive)
//
// Works on the content folder in ATLAS_CONTENT_DIR when it's set (the dev save API's files),
// otherwise on Firestore through the Admin SDK, like the CLI. On Firestore, HTTP keys are the
// same per-AI keys as the hosted server (`atlas mcp-key add`). On files, the key is
// ATLAS_MCP_KEY, or a random one kept in .atlas-local/mcp-key (git-ignored), and acts as --ai.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.ts";
import { handleMcp } from "./http.ts";
import { fileBackend, type Backend } from "../server/backend.ts";
import { AI_IDS, isAi, type AiId } from "../src/lib/personas.ts";

// The app folder: one up from mcp/, or two up from the bundle in mcp/dist/.
const here = dirname(fileURLToPath(import.meta.url));
const appRoot = existsSync(join(here, "..", "package.json")) ? join(here, "..") : join(here, "..", "..");
const dir = process.env.ATLAS_CONTENT_DIR;
if (dir && !existsSync(dir)) {
  console.error(`ATLAS_CONTENT_DIR ${dir} doesn't exist.`);
  process.exit(1);
}
const aiArg = process.argv.indexOf("--ai");
const ai = (aiArg === -1 ? (process.env.ATLAS_MCP_AI ?? "grok") : process.argv[aiArg + 1]) as AiId;
if (!isAi(ai)) {
  console.error(`--ai must be one of: ${AI_IDS.join(", ")}`);
  process.exit(1);
}
let db: Backend;
let checkKey: (key: string) => Promise<AiId | null>;
try {
  if (dir) {
    db = fileBackend(dir);
    const local = Buffer.from(localKey());
    checkKey = async (key) => {
      const given = Buffer.from(key);
      return given.length === local.length && timingSafeEqual(given, local) ? ai : null;
    };
  } else {
    const fb = await import("../server/firestore-backend.ts");
    const { keyChecker } = await import("../server/mcp-keys.ts");
    const { getFirestore } = await import("firebase-admin/firestore");
    db = fb.firestoreBackend();
    checkKey = keyChecker(getFirestore(fb.adminApp()));
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

// ---------- transports ----------

function localKey(): string {
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
  await buildServer(db, { ai }).connect(new StdioServerTransport());
} else {
  const port = Number(process.argv[portArg + 1] ?? 5190);
  createServer((req, res) => {
    if (new URL(req.url ?? "/", "http://local").pathname !== "/mcp") {
      res.statusCode = 404;
      return res.end();
    }
    void handleMcp({ db, checkKey }, req, res).catch((e) => {
      if (!res.headersSent) res.statusCode = 500;
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    });
  }).listen(port, "127.0.0.1", () => {
    console.error(
      `Atlas MCP on http://127.0.0.1:${port}/mcp (${dir ? `files, key acts as ${ai}` : "Firestore, per-AI keys"})`,
    );
  });
}
