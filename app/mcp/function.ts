// The hosted Atlas MCP server: a Cloud Function behind Firebase Hosting at
// https://<project>.web.app/mcp, so other AIs connect to one fixed address that works with
// the Mac off. Bundled into functions/index.js by `npm run mcp:function` and deployed with
// `firebase deploy --only functions,hosting`. Keys: `atlas mcp-key add <ai>`.
import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { adminApp, firestoreBackend } from "../server/firestore-backend.ts";
import { keyChecker } from "../server/mcp-keys.ts";
import { handleMcp } from "./http.ts";

const firestore = getFirestore(adminApp());
const db = firestoreBackend(firestore);
const checkKey = keyChecker(firestore);

export const mcp = onRequest(
  // One small instance is plenty for a few bots; the cap keeps a runaway client cheap.
  { region: "asia-south1", maxInstances: 2, concurrency: 20, memory: "512MiB", timeoutSeconds: 60, invoker: "public" },
  async (req, res) => {
    try {
      // Cloud Functions has already parsed the JSON body.
      await handleMcp({ db, checkKey }, req, res, req.method === "POST" ? req.body : undefined);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  },
);
