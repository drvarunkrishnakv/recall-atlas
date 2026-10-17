// The hosted Atlas MCP server: a Cloud Function behind Firebase Hosting at
// https://<project>.web.app/mcp, so other AIs connect to one fixed address that works with
// the Mac off. It also serves the OAuth endpoints (server/oauth.ts) for apps that sign in by
// OAuth, such as the Gemini app and Claude's custom connectors. Bundled into
// functions/index.js by `npm run mcp:function`. Keys: `atlas mcp-key add <ai>`.
import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { adminApp, firestoreBackend } from "../server/firestore-backend.ts";
import { keyChecker } from "../server/mcp-keys.ts";
import { oauthHandler, oauthTokenChecker, resourceMetadataUrl } from "../server/oauth.ts";
import { handleMcp } from "./http.ts";

const app = adminApp();
const firestore = getFirestore(app);
const db = firestoreBackend(firestore);
const base = process.env.ATLAS_PUBLIC_URL ?? `https://${process.env.GCLOUD_PROJECT}.web.app`;
const byKey = keyChecker(firestore);
const byToken = oauthTokenChecker(firestore);
const checkKey = async (k: string) => (k.startsWith("atlas_at_") ? byToken(k) : byKey(k));
const oauth = oauthHandler({ fs: firestore, auth: getAuth(app), base });

export const mcp = onRequest(
  // One small instance is plenty for a few bots; the cap keeps a runaway client cheap.
  { region: "asia-south1", maxInstances: 2, concurrency: 20, memory: "512MiB", timeoutSeconds: 60, invoker: "public" },
  async (req, res) => {
    try {
      if (await oauth(req, res)) return;
      // Cloud Functions has already parsed the JSON body.
      await handleMcp(
        { db, checkKey, resourceMetadata: resourceMetadataUrl(base) },
        req,
        res,
        req.method === "POST" ? req.body : undefined,
      );
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  },
);
