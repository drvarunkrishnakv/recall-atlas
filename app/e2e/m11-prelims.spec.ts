import { expect, test, type Page } from "@playwright/test";

// M11: the Prelims Home, the subject page with its analytics drawer, and Prelims Analytics, on
// the made-up fixture ("Sample geography" has a few weeks of made-up attempts up to 20 Oct 2026).
// The clock is fixed to the evening of 21 Oct 2026 so the numbers don't drift as time passes.

test.use({ timezoneId: "Asia/Kolkata" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-21T18:30:00+05:30"));
});

const narrow = (page: Page) => (page.viewportSize()?.width ?? 1440) <= 900;

async function noSideScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
}

const topics = (page: Page) => page.locator("main .st-topic").allTextContents();

test("Prelims Home: the Puzzle button, the cards, and subject tiles that open their subject page", async ({ page }) => {
  await page.goto("/prelims");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1, name: "Prelims" })).toBeVisible();
  await expect(main.getByText(/\d+ days to Prelims/)).toBeVisible();

  const puzzle = main.getByRole("link", { name: /Puzzles/ });
  await expect(puzzle).toHaveAttribute("href", "/prelims/puzzles");
  await expect(puzzle).toContainText(/Rating \d+/);
  await expect(main.getByRole("region", { name: "Tonight's lesson" })).toContainText("No lesson yet");
  await expect(main.getByRole("region", { name: "Reviews" })).toContainText(/\d+ MCQs · \d+ flashcards/);
  await expect(main.getByText(/^13 questions ready/)).toBeVisible();
  if (narrow(page)) {
    // On phones the Puzzle button comes first.
    const practise = main.getByRole("region", { name: "Practise" });
    expect((await puzzle.boundingBox())!.y).toBeLessThan((await practise.boundingBox())!.y);
  }

  const tile = main.getByRole("link", { name: /Sample geography/ });
  await expect(tile).toContainText("Weak spot: Sample passes");
  await expect(tile).toHaveAccessibleName(/readiness \d+ of 1000/);
  await expect(main.getByText("Prelims readiness")).toBeVisible();
  await noSideScroll(page);

  await tile.click();
  await expect(page).toHaveURL(/\/prelims\/subject\/sample-geography$/);
  await expect(main.getByRole("heading", { level: 1 })).toContainText("Sample geography");
  await page.goBack();
  await expect(page).toHaveURL(/\/prelims$/);
});

test("the subject table sorts and filters, and a count opens the topic's analytics", async ({ page }) => {
  await page.goto("/prelims/subject/sample-geography");
  const main = page.locator("main");
  await expect.poll(() => topics(page)).toEqual(["Sample hills", "Sample rivers", "Sample tides"]);
  await noSideScroll(page);

  // Sorts: Sample tides holds the most PYQs; book order puts it last.
  await main.getByRole("button", { name: "Most asked" }).click();
  await expect(page).toHaveURL(/sort=asked/);
  await expect.poll(async () => (await topics(page))[0]).toBe("Sample tides");
  await main.getByRole("button", { name: "Weakest" }).click();
  await expect.poll(async () => (await topics(page))[0]).toBe("Sample tides");
  await main.getByRole("button", { name: "Book order" }).click();
  await expect.poll(async () => (await topics(page))[0]).toBe("Sample hills");

  // Filters: Sample hills was read on 2 Oct; Sample tides has nothing due.
  await main.getByRole("button", { name: "Not read yet" }).click();
  await expect(main.getByRole("button", { name: "Sample tides", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "Sample hills", exact: true })).toHaveCount(0);
  await main.getByRole("button", { name: "Not read yet" }).click();
  await main.getByRole("button", { name: "Due", exact: true }).click();
  await expect(main.getByRole("button", { name: "Sample hills", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "Sample tides", exact: true })).toHaveCount(0);
  await main.getByRole("button", { name: "Due", exact: true }).click();

  // A topic opens into its microthemes.
  await main.getByRole("button", { name: "Sample hills", exact: true }).click();
  await expect(main.getByText("Sample passes", { exact: true })).toBeVisible();
  await noSideScroll(page);

  // The MCQ count opens the drawer (a page of its own on phones).
  await main.getByRole("button", { name: /^MCQs in Sample hills/ }).click();
  await expect(page).toHaveURL(/open=fixture-hills&kind=mcq/);
  const drawer = page.getByRole("complementary", { name: "Topic analytics" });
  await expect(drawer.getByRole("heading", { name: "Sample hills" })).toBeVisible();
  await expect(drawer.getByText("recall, last 4 weeks")).toBeVisible();
  await expect(drawer.getByText("Last 14 days")).toBeVisible();
  await expect(drawer.getByText("Sample passes")).toBeVisible();
  await expect(drawer.getByText("Mixed up")).toBeVisible();
  await expect(drawer.getByRole("link", { name: /^Start/ })).toHaveAttribute(
    "href",
    /\/prelims\/session\?banks=fixture-hills/,
  );
  await noSideScroll(page);
  if (narrow(page)) {
    await expect(main.locator(".st-table")).toHaveCount(0);
    await drawer.getByRole("button", { name: "Sample geography" }).click();
  } else {
    await expect(main.locator(".st-table")).toBeVisible();
    await drawer.getByRole("button", { name: "Close" }).click();
  }
  await expect(drawer).toHaveCount(0);
  await expect(page).not.toHaveURL(/open=/);

  // The flashcard count opens the cards' drawer; back closes it.
  await main.getByRole("button", { name: /^Flashcards in Sample hills/ }).click();
  await expect(drawer.getByText(/^Flashcards · Sample geography/)).toBeVisible();
  await expect(drawer.getByRole("link", { name: /cards/ })).toHaveAttribute(
    "href",
    "/prelims/cards?banks=fixture-hills",
  );
  await page.goBack();
  await expect(drawer).toHaveCount(0);
  await expect(main.getByRole("button", { name: /^MCQs in Sample hills/ })).toBeVisible();
});

test("Log reading is saved: it survives a reload and reaches the Home", async ({ page }) => {
  await page.goto("/prelims/subject/sample-geography");
  const main = page.locator("main");
  await main.getByRole("button", { name: "Log reading" }).click();
  await page
    .getByRole("menu", { name: "Log reading" })
    .getByRole("menuitem", { name: /Sample rivers/ })
    .click();
  await expect(page.getByRole("status")).toContainText("Logged Sample rivers as read today.");
  const row = main.locator(".st-row", { has: page.getByRole("button", { name: "Sample rivers", exact: true }) });
  await expect(row.locator(".st-read")).toContainText("Today");
  await page.reload();
  await expect(row.locator(".st-read")).toContainText("Today");
  await noSideScroll(page);

  await page.goto("/prelims");
  await expect(main.getByText("You logged Sample rivers today")).toBeVisible();
  await expect(main.getByRole("region", { name: "Practise" })).toContainText("Today's reading");
  await expect(main.getByRole("link", { name: /Practise now/ })).toHaveAttribute("href", /banks=fixture-rivers/);
});

test("Analytics tells the week's story, and the range switches between 4 weeks, 8 weeks and all time", async ({
  page,
}) => {
  await page.goto("/prelims/analytics");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(/^Readiness \d+ \/ 1000/);
  // M9's fixture has a weekly note; each line links to its evidence.
  await expect(main.getByRole("link", { name: /two of the week's three misses/ })).toHaveAttribute(
    "href",
    "/prelims/notebook?filter=week",
  );
  for (const part of ["Coverage", "Memory", "New questions", "Speed", "Calibration"])
    await expect(main.getByText(part, { exact: true })).toBeVisible();
  // The subject with most misses this week (the M7 session test can add misses to Sample subject).
  await expect(
    main.getByRole("heading", { name: /^Sample (geography|subject): \d+ miss(es)? this week/ }),
  ).toBeVisible();
  await expect(main.getByRole("heading", { name: /a question/ })).toBeVisible();
  await expect(main.getByRole("heading", { name: /Confident misses/ })).toBeVisible();
  await expect(main.getByRole("heading", { name: /^Next week: more/ })).toBeVisible();
  await expect(main.getByText("Your guessing rule")).toBeVisible();
  await noSideScroll(page);

  const range = main.getByRole("group", { name: "Time range" });
  await expect(range.getByRole("button", { name: "8 weeks" })).toHaveAttribute("aria-pressed", "true");
  await expect(main.getByText("Prelims readiness · last 8 weeks")).toBeVisible();
  await range.getByRole("button", { name: "4 weeks" }).click();
  await expect(page).toHaveURL(/range=4w/);
  await expect(range.getByRole("button", { name: "4 weeks" })).toHaveAttribute("aria-pressed", "true");
  await expect(main.getByText("Prelims readiness · last 4 weeks")).toBeVisible();
  await range.getByRole("button", { name: "All time" }).click();
  await expect(page).toHaveURL(/range=all/);
  await expect(main.getByText("Prelims readiness · all time")).toBeVisible();
  await range.getByRole("button", { name: "8 weeks" }).click();
  await expect(page).not.toHaveURL(/range=/);
  await noSideScroll(page);

  await main.getByRole("button", { name: /^Effort/ }).click();
  await expect(main.getByText(/questions a day on average/)).toBeVisible();
  await main.getByRole("button", { name: /^Mock tests/ }).click();
  await expect(main.getByText(/no predicted score/)).toBeVisible();
  await noSideScroll(page);

  if (!narrow(page)) {
    await expect(page.locator(".nav").getByRole("link", { name: "Analytics" })).toHaveClass(/active/);
  }
});
