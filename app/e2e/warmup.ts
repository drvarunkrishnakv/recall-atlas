import { chromium, type FullConfig } from "@playwright/test";

// Loads the app once before the tests, so Vite finishes optimising the editor's
// dependencies (which reloads the page) before any test is timed.
export default async function warmup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/notes/P06`, { timeout: 120_000 });
  await page.locator(".bn-editor").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  await page.reload();
  await page.locator(".bn-editor").waitFor({ timeout: 120_000 });
  await browser.close();
}
