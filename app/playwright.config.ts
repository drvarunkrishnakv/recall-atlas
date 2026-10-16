import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Runs against a throwaway copy of the synthetic fixture, so CI never sees real notes and
// tests can save freely. One worker: the tests edit the same pages.
if (!process.env.ATLAS_E2E_DIR) {
  const dir = mkdtempSync(join(tmpdir(), "atlas-e2e-"));
  cpSync(join(import.meta.dirname, "fixtures/content"), dir, { recursive: true });
  process.env.ATLAS_E2E_DIR = dir;
}

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  workers: 1,
  use: { baseURL: "http://localhost:4174", trace: "retain-on-failure" },
  webServer: {
    command: "npx vite --port 4174 --strictPort",
    url: "http://localhost:4174",
    reuseExistingServer: false,
    env: { ATLAS_CONTENT_DIR: process.env.ATLAS_E2E_DIR },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      name: "ipad",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true },
    },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
});
