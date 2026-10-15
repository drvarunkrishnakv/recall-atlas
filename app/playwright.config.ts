import { defineConfig, devices } from "@playwright/test";

// Runs against the synthetic fixture content only (no ATLAS_CONTENT_DIR), so CI never sees real notes.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:4174", trace: "retain-on-failure" },
  webServer: {
    command: "npx vite --port 4174 --strictPort",
    url: "http://localhost:4174",
    reuseExistingServer: !process.env.CI,
    env: { ATLAS_CONTENT_DIR: "" },
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
