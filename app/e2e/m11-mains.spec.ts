import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// M11: the Mains Home at "/" and Mains Analytics, on the made-up fixture (marked answers on GS1 and
// GS2 from 14 Aug to 14 Oct 2026, and one GS3 answer waiting). The clock is fixed to the evening of
// 21 Oct 2026 so the numbers don't drift. The M8 tests may add answers waiting for marking, so
// counts that those change are matched loosely.

test.use({ timezoneId: "Asia/Kolkata" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-21T18:30:00+05:30"));
});

const narrow = (page: Page) => (page.viewportSize()?.width ?? 1440) <= 900;
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;

async function noSideScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
}

test("Mains Home: the centre button starts today's answer on the Write screen", async ({ page }) => {
  await page.goto("/");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(/Good (morning|afternoon|evening)/);
  await expect(main.getByText(/of today's 2 answers written · \d+ days to Mains/)).toBeVisible();

  const today = main.getByRole("link", { name: /today's answer/i });
  await expect(today).toHaveAttribute("href", /^\/mains\/write\?q=gs/);
  await expect(today).toContainText("Start writing");
  // The fixture's 15 Sep answer scored 5 and is four weeks old, so its question comes back first.
  await expect(today).toContainText("Retry · last time 5");
  const question = (await today.locator(".mh-today-q").textContent())!;
  if (narrow(page)) {
    // On phones the button comes first, above the notes due.
    const notes = main.getByRole("region", { name: "Notes due" });
    expect((await today.boundingBox())!.y).toBeLessThan((await notes.boundingBox())!.y);
  }
  await noSideScroll(page);

  await today.click();
  await expect(page).toHaveURL(/\/mains\/write\?q=gs2-2020-sample-chair$/);
  await expect(page.getByText(question).first()).toBeVisible();
  await expect(page.getByText("It asks for")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test("Mains Home: the last feedback opens its marked page, and a waiting answer says so", async ({ page }) => {
  await page.goto("/");
  const main = page.locator("main");
  const card = main.getByRole("region", { name: "Last feedback" });
  await expect(card).toContainText("Feedback ready");
  await expect(card).toContainText("Sample question: how does a sample monsoon shape farming");
  await expect(card).toContainText("/ 10 · written 14 Oct");
  await expect(card).toContainText("Keep: Sample: the effects come in a clear order");
  await expect(card).toContainText("Fix: Sample fix: add the sample region's water and soils.");
  await expect(card.getByRole("link", { name: /waiting for marking · sent/ })).toBeVisible();

  // From Claude: the answer marked this week, and the inbox.
  const claude = main.getByRole("region", { name: "From Claude" });
  await expect(claude.getByRole("link", { name: "1 answer marked this week" })).toHaveAttribute(
    "href",
    "/mains/answers/a-20261014-sample04",
  );
  await expect(claude.getByRole("link", { name: /Open inbox/ })).toHaveAttribute("href", "/inbox");

  await card.getByRole("link", { name: "Open feedback" }).click();
  await expect(page).toHaveURL(/\/mains\/answers\/a-20261014-sample04$/);
  await expect(page.getByRole("region", { name: "Where the marks went" })).toBeVisible();
  await page.goBack();

  await main
    .getByRole("region", { name: "Last feedback" })
    .getByRole("link", { name: /waiting for marking/ })
    .click();
  await expect(page).toHaveURL(/\/mains\/answers\/a-/);
  await expect(page.getByRole("region", { name: "Waiting for marking" })).toBeVisible();
});

test("Mains Home: paper tiles give each paper's average and notes, and lead to the paper", async ({ page }) => {
  await page.goto("/");
  const main = page.locator("main");
  const papers = main.getByRole("region", { name: "Papers" });
  await expect(papers.locator(".mh-tile")).toHaveCount(6);
  await expect(papers.getByRole("link", { name: /^GS1: average 6\.5 of 10; notes not started$/ })).toBeVisible();
  // The desktop run of atlas.spec starts a planned note, so GS2 may have two written.
  await expect(
    papers.getByRole("link", { name: /^GS2: average 5\.3 of 10; \d+ of 24 notes written$/ }),
  ).toHaveAttribute("href", "/mains/notes?paper=gs2");
  await expect(papers.getByRole("link", { name: /^GS3: 1 waiting for marking/ })).toBeVisible();
  await expect(papers.getByRole("link", { name: /^Essay: no essays yet/ })).toHaveAttribute("href", "/mains/essay");
  const medical = papers.locator(".mh-tile", { hasText: "Medical Science" });
  await expect(medical).toContainText("500");
  await expect(medical.getByRole("link", { name: /^Medical Science/ })).toHaveAttribute("href", "/mains/medical");
  await expect(papers).toContainText("1,750 written marks");
  await noSideScroll(page);

  // The subject inside a tile still opens its notes table.
  await papers.getByRole("link", { name: "Polity", exact: true }).click();
  await expect(page).toHaveURL(/\/gs2\/polity$/);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Polity");
  await page.goBack();
  await main.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page).toHaveURL(/\/mains\/analytics$/);
});

test("Mains Analytics: the week's story with its charts, and the 8-week, 4-week and all-time range", async ({
  page,
}) => {
  await page.goto("/mains/analytics");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1, name: "Mains analytics" })).toBeVisible();
  await expect(main.getByText(/no predicted Mains score until you sit two full papers \(0 so far\)/)).toBeVisible();
  const note = main.getByRole("region", { name: "This week, from Claude" });
  await expect(note.getByRole("listitem")).toHaveCount(6);
  await expect(note).toContainText("No weekly note from Claude on your answers yet.");

  await expect(
    main.getByRole("heading", { name: "1 · Your scores are rising: 6.8 in October, 5.5 in September." }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "2 · Dimensions cost you the most: 4.5 marks across 4 answers." }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "3 · Your self-scores are getting honest: 0.3 too high, from 1.0 too high." }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", { name: /^4 · You're faster: 6:45 a 10-marker, from 7:36, but 2 of \d+ ran over\.$/ }),
  ).toBeVisible();
  await expect(main.getByRole("heading", { name: /^5 · You write about [\d.]+ answers? a week/ })).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "6 · Medical Science is 500 marks and hasn't started." }),
  ).toBeVisible();
  await expect(
    main.getByRole("img", { name: /Answers written each week, last 8 weeks, against a target of 7 to 14/ }),
  ).toBeVisible();
  await noSideScroll(page);

  // Each line of the story jumps to its evidence.
  await note.getByRole("link", { name: /Dimensions cost you the most/ }).click();
  await expect(page).toHaveURL(/#checklist$/);
  await expect(main.getByRole("link", { name: "See the 2 answers tagged Thin dimensions →" })).toHaveAttribute(
    "href",
    "/mains/feedback?tag=thin-dimensions",
  );

  const range = main.getByRole("group", { name: "Time range" });
  const scores = main.getByRole("region", { name: /^1 · / });
  await expect(range.getByRole("button", { name: "8 weeks" })).toHaveAttribute("aria-pressed", "true");
  await expect(scores.getByText("Average score by week · last 8 weeks")).toBeVisible();
  await expect(scores.locator(".col")).toHaveCount(8);
  await range.getByRole("button", { name: "4 weeks" }).click();
  await expect(page).toHaveURL(/range=4w/);
  await expect(scores.getByText("Average score by week · last 4 weeks")).toBeVisible();
  await expect(scores.locator(".col")).toHaveCount(4);
  await expect(
    main.getByRole("heading", { name: /^2 · Dimensions cost you the most: 3 marks across 3 answers\.$/ }),
  ).toBeVisible();
  await range.getByRole("button", { name: "All time" }).click();
  await expect(page).toHaveURL(/range=all/);
  await expect(scores.getByText("Average score by week · all time")).toBeVisible();
  // From the first answer on 14 Aug to 21 Oct: ten weeks.
  await expect(scores.locator(".col")).toHaveCount(10);
  await range.getByRole("button", { name: "8 weeks" }).click();
  await expect(page).not.toHaveURL(/range=/);
  await noSideScroll(page);

  if (isDesktop(page)) {
    await expect(page.locator(".nav").getByRole("link", { name: "Analytics" })).toHaveClass(/active/);
  }
});

test("Claude's weekly note: Mains lines show on Mains Analytics, linked to their evidence, and not on Prelims", async ({
  page,
}) => {
  test.skip(!isDesktop(page), "Writes the shared weekly note; once is enough");
  const dir = mkdtempSync(join(tmpdir(), "atlas-week-"));
  const cli = (file: string) =>
    execFileSync("node", ["cli/atlas.ts", "week-note", "2026-W43", file], {
      env: { ...process.env, ATLAS_CONTENT_DIR: process.env.ATLAS_E2E_DIR },
    });
  writeFileSync(
    join(dir, "note.json"),
    JSON.stringify({
      lines: [
        {
          text: "Sample Prelims line: three misses in the sample topic.",
          evidence: { route: "/prelims/notebook?filter=week", label: "This week's misses" },
        },
        {
          text: "Sample Mains line: dimensions cost the most marks again.",
          evidence: { route: "/mains/analytics#checklist", label: "Marks kept per checklist item" },
        },
        {
          text: "Sample Mains line: one answer waits for marking.",
          evidence: { route: "/mains/feedback", label: "Every answer" },
        },
      ],
    }),
  );
  cli(join(dir, "note.json"));
  try {
    await page.goto("/");
    await expect(
      page
        .locator("main")
        .getByRole("region", { name: "From Claude" })
        .getByRole("link", { name: "Weekly note: 2 lines on your answers" }),
    ).toHaveAttribute("href", "/mains/analytics");
    await page.goto("/mains/analytics");
    const note = page.locator("main").getByRole("region", { name: "This week, from Claude" });
    await expect(note).toContainText("This week, from Claude · week of 19 Oct");
    await expect(note.getByRole("listitem")).toHaveCount(2);
    await expect(note).not.toContainText("Sample Prelims line");
    await expect(note.getByRole("link", { name: /dimensions cost the most marks again/ })).toHaveAttribute(
      "href",
      "#checklist",
    );
    await note.getByRole("link", { name: /one answer waits for marking/ }).click();
    await expect(page).toHaveURL(/\/mains\/feedback$/);

    await page.goto("/prelims/analytics");
    const prelims = page.locator("main").getByRole("region", { name: "Claude's note on your week" });
    await expect(prelims).toContainText("Sample Prelims line");
    await expect(prelims).not.toContainText("Sample Mains line");
  } finally {
    // Put the fixture's note back for the other tests.
    cli(join(process.cwd(), "fixtures/content/practice/weeks/2026-W43.json"));
  }
});
