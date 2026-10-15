import { expect, test, type Page } from "@playwright/test";

const isTouch = (page: Page) =>
  page.evaluate(() => matchMedia("(hover: none), (pointer: coarse)").matches || innerWidth < 600);

async function noSideScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
}

test("navigates paper → subject → topic → note in single clicks, and back works", async ({ page }) => {
  await page.goto("/");
  const narrow = (page.viewportSize()?.width ?? 1440) <= 900;
  // Click the page's own links: on phones the sidebar is a closed drawer.
  const main = page.locator("main");
  await main.getByRole("link", { name: /GS Paper 2/ }).click();
  await main.getByRole("link", { name: /Polity/ }).click();
  await main.getByRole("link", { name: /Constitution & its foundations/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Constitution & its foundations");
  await main.getByRole("link", { name: "Women's political representation & reservation" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fixture note: how a sample topic reads");
  await noSideScroll(page);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Constitution & its foundations");
  if (narrow) {
    await page.getByRole("button", { name: "Open navigator" }).click();
    await expect(page.locator(".frame.nav-open")).toBeVisible();
  }
});

test("a card term opens its card in place", async ({ page }) => {
  await page.goto("/notes/P06");
  const term = page.getByRole("button", { name: "sample concept" });
  if (await isTouch(page)) {
    await term.click();
    await expect(page.locator(".pop.sheet")).toBeVisible();
  } else {
    await term.hover();
    await expect(page.locator(".pop")).toBeVisible();
  }
  await expect(page.locator(".pop h4")).toHaveText("Sample card (fixture)");
  await page.getByRole("link", { name: /Open full card/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sample card (fixture)");
  await expect(page.getByRole("link", { name: "Fixture note: how a sample topic reads" })).toBeVisible();
});

test("charts and flowcharts render", async ({ page }) => {
  await page.goto("/notes/P06");
  await expect(page.locator("figure.visual svg").first()).toBeVisible();
  await expect(page.locator(".mermaid-box svg")).toBeVisible({ timeout: 15_000 });
  await noSideScroll(page);
});

test("unknown pages say so", async ({ page }) => {
  await page.goto("/notes/NOPE");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
});
