/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { contentApi } from "./server/content-api.ts";

// Note content is private. The dev server reads and saves it in ATLAS_CONTENT_DIR (the
// private notes repo's content/ folder). Without it, a git-ignored copy of the synthetic
// fixture is used, which is the only content this public repo holds. The cloud build
// (`--mode cloud`) uses Firestore instead, and this API stays for local work and tests.
function atlasApi(): Plugin {
  const appRoot = fileURLToPath(new URL(".", import.meta.url));
  return {
    name: "atlas-api",
    configureServer: (server) => void server.middlewares.use(contentApi(appRoot)),
    configurePreviewServer: (server) => void server.middlewares.use(contentApi(appRoot)),
  };
}

export default defineConfig({
  plugins: [react(), atlasApi()],
  server: { watch: { ignored: ["**/.atlas-local/**"] } },
  // Mermaid ships large optional chunks (layout engines) that load only when a diagram needs them.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    include: ["src/**/*.test.ts", "mcp/**/*.test.ts"],
    // The Firestore tests need the emulators: npm run test:cloud.
    exclude: ["**/*.emulator.test.ts", "**/node_modules/**"],
    environment: "node",
  },
});
