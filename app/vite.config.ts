/// <reference types="vitest/config" />
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { parseFrontMatter } from "./src/lib/content-parse.ts";

// Note content is private. It is read at dev/build time from ATLAS_CONTENT_DIR (the
// private notes repo's content/ folder). Without it, the synthetic fixture is used, which
// is the only content this public repo holds. M2 replaces this with Firestore.
const VIRTUAL = "virtual:atlas-content";

function atlasContent(): Plugin {
  const dir = resolve(
    process.env.ATLAS_CONTENT_DIR || join(fileURLToPath(new URL(".", import.meta.url)), "fixtures/content"),
  );
  const read = (sub: string) => {
    const folder = join(dir, sub);
    if (!existsSync(folder)) return [];
    return readdirSync(folder)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => {
        const { meta, body } = parseFrontMatter(readFileSync(join(folder, f), "utf8"));
        return { ...meta, id: String(meta.id ?? f.replace(/\.md$/, "")), body };
      });
  };
  return {
    name: "atlas-content",
    resolveId: (id) => (id === VIRTUAL ? "\0" + VIRTUAL : null),
    load(id) {
      if (id !== "\0" + VIRTUAL) return null;
      for (const sub of ["notes", "cards"]) {
        const folder = join(dir, sub);
        if (existsSync(folder)) readdirSync(folder).forEach((f) => this.addWatchFile(join(folder, f)));
      }
      return `export const notes = ${JSON.stringify(read("notes"))};\nexport const cards = ${JSON.stringify(read("cards"))};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), atlasContent()],
  // Mermaid ships large optional chunks (layout engines) that load only when a diagram needs them.
  build: { chunkSizeWarningLimit: 1500 },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
