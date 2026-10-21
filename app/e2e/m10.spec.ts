import { expect, test, type Locator, type Page } from "@playwright/test";

// M10: flashcards, puzzles and Rush, on the made-up items in fixtures/content/practice/banks/
// fixture-more.json. Runs against the same throwaway copy of the fixture as atlas.spec.ts.

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;

async function noSideScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
}

interface LoggedAttempt {
  itemId: string;
  kind: string;
  at: string;
  mode: string;
  correct: boolean;
  grade?: string;
  typed?: string;
  delta?: number;
  session?: string;
}

/** The attempts the server has saved since `since` (ISO time). */
async function savedSince(page: Page, since: string): Promise<LoggedAttempt[]> {
  const r = await page.request.get("/api/practice");
  const { days } = (await r.json()) as { days: Record<string, LoggedAttempt[]> };
  return Object.values(days)
    .flat()
    .filter((a) => a.at >= since);
}

/** Drags an element sideways by `dx` pixels, as a finger or mouse would. */
async function fling(page: Page, el: Locator, dx: number) {
  const box = (await el.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 4, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 6 });
  await page.mouse.up();
}

test("Prelims Home and the sidebar lead to flashcards, puzzles and Rush", async ({ page }) => {
  await page.goto("/prelims");
  // M11's home: the big Puzzles button, with Rush and Flashcards under it.
  const opts = page.locator(".ph-centre");
  await expect(opts.getByRole("link", { name: /^Puzzles: play/ })).toBeVisible();
  for (const name of [/^Rush/, /^Flashcards$/]) await expect(opts.getByRole("link", { name })).toBeVisible();
  if (isDesktop(page)) {
    const nav = page.getByRole("navigation", { name: "Prelims" });
    await nav.getByRole("link", { name: "Puzzles" }).click();
    await expect(page).toHaveURL(/\/prelims\/puzzles$/);
    await nav.getByRole("link", { name: "Flashcards" }).click();
    await expect(page).toHaveURL(/\/prelims\/cards$/);
    await nav.getByRole("link", { name: "Rush" }).click();
    await expect(page).toHaveURL(/\/prelims\/rush$/);
  } else {
    await opts.getByRole("link", { name: /^Puzzles: play/ }).click();
    await expect(page).toHaveURL(/\/prelims\/puzzles$/);
  }
});

test("a flashcard: type, flip, fling right for Knew it, fling left for Forgot; both are saved", async ({ page }) => {
  const since = new Date().toISOString();
  await page.goto("/prelims/cards?items=fc-qa-1,fc-cloze-1");
  const first = page.getByRole("region", { name: "Card 1 of 2" });
  await expect(first.getByText("Which schedule of the Sample Charter lists the sample rivers?")).toBeVisible();
  await expect(page.getByText("2 left")).toBeVisible();
  await page.getByLabel("Your answer").fill("fourth");
  await page.getByLabel("Your answer").press("Enter");
  await expect(first.getByText("The Fourth Schedule", { exact: true })).toBeVisible();
  await expect(first.getByText("You wrote “fourth”: matches")).toBeVisible();
  // The typed answer suggests Knew it.
  await expect(page.getByRole("button", { name: /Knew it/ })).toHaveClass(/suggested/);
  await noSideScroll(page);
  await fling(page, first, 240);

  const second = page.getByRole("region", { name: "Card 2 of 2" });
  await expect(second.getByText("Sample rights sit under Article")).toBeVisible();
  await expect(page.getByText("1 left")).toBeVisible();
  await page.getByLabel("Your answer").fill("article 9");
  await page.getByRole("button", { name: /Flip/ }).click();
  // A cloze card shows the blank filled in.
  await expect(second.locator("mark")).toHaveText("Article 7");
  await expect(second.getByText("You wrote “article 9”: doesn't match")).toBeVisible();
  await expect(page.getByRole("button", { name: /Forgot/ })).toHaveClass(/suggested/);
  await fling(page, second, -240);

  await expect(page.getByRole("heading", { name: "Deck done" })).toBeVisible();
  await expect(page.getByText("1 card was shaky")).toBeVisible();
  await noSideScroll(page);

  await expect
    .poll(async () =>
      (await savedSince(page, since))
        .filter((a) => a.kind === "flashcard")
        .map((a) => `${a.itemId}:${a.grade}:${a.correct}:${a.typed}`)
        .sort(),
    )
    .toEqual(["fc-cloze-1:forgot:false:article 9", "fc-qa-1:good:true:fourth"]);
});

test("flashcards: a list ticks off what you named, a picture card shows its image, Hard and Easy grade", async ({
  page,
}) => {
  test.skip(!isDesktop(page) && page.viewportSize()!.width > 900, "Desktop and phone are enough");
  const since = new Date().toISOString();
  await page.goto("/prelims/cards?items=fc-list-1,fc-image-1");
  const list = page.getByRole("region", { name: "Card 1 of 2" });
  await page.getByLabel("Your answer").fill("2, 9");
  await page.getByRole("button", { name: /Flip/ }).click();
  await expect(list.getByText("You named 2 of 3: “2, 9”")).toBeVisible();
  const port5 = list.getByRole("button", { name: /Port 5/ });
  await expect(port5).toHaveAttribute("aria-pressed", "false");
  await port5.click();
  await expect(port5).toHaveAttribute("aria-pressed", "true");
  await expect(list.getByText("You named 3 of 3")).toBeVisible();
  await page.getByRole("button", { name: /^Easy/ }).click();

  const pic = page.getByRole("region", { name: "Card 2 of 2" });
  await expect(pic.getByRole("img", { name: /A made-up coast/ })).toBeVisible();
  await page.getByRole("button", { name: /Flip/ }).click();
  await expect(pic.getByText("You didn't type an answer")).toBeVisible();
  await expect(pic.getByText("Strait of Testmore")).toBeVisible();
  await page.getByRole("button", { name: /^Hard/ }).click();
  await expect(page.getByRole("heading", { name: "Deck done" })).toBeVisible();
  await expect
    .poll(async () =>
      (await savedSince(page, since))
        .filter((a) => a.kind === "flashcard")
        .map((a) => `${a.itemId}:${a.grade}:${a.typed}`)
        .sort(),
    )
    .toEqual(["fc-image-1:hard:", "fc-list-1:easy:2, 9"]);
});

test("puzzles: each style answered right and wrong moves the rating; misses are logged", async ({ page }) => {
  const since = new Date().toISOString();
  const order = ["Sample charter signed", "First sample election", "Sample ports opened", "Sample capital moved"];
  const ids = ["fz-tf-1", "fz-match-1", "fz-order-1", "fz-map-1"].flatMap((id) => [id, id]).join(",");
  await page.goto(`/prelims/puzzles?items=${ids}`);
  const rating = async () => Number(await page.locator(".pz-star b").textContent());
  const sheet = page.getByRole("region", { name: "Result" });

  async function expectMove(before: number, right: boolean) {
    await expect(sheet.getByText(right ? "Solved" : "Not quite")).toBeVisible();
    const delta = Number((await sheet.locator(".pz-sheet-delta").textContent())!.replace("−", "-"));
    expect(right ? delta > 0 : delta < 0).toBe(true);
    await expect.poll(rating).toBe(before + delta);
    if (!right) await expect(sheet.getByText("Logged for tonight's lesson")).toBeVisible();
  }
  async function next() {
    await sheet.getByRole("button", { name: "Next puzzle" }).click();
    await expect(sheet).toHaveCount(0);
  }

  // True or false.
  await expect(page.getByText("It rises in the north hills.")).toBeVisible();
  await expect(page.getByText("Puzzle 480")).toBeVisible();
  await noSideScroll(page);
  let r = await rating();
  await page.getByRole("button", { name: "True", exact: true }).click();
  await expectMove(r, true);
  // The real explanation, with who wrote and checked it.
  await expect(sheet.getByText(/rises in the sample north hills and gathers its tributaries/)).toBeVisible();
  await expect(sheet.getByText("Explanation by Claude, checked by Grok and Gemini")).toBeVisible();
  await next();
  r = await rating();
  await page.getByRole("button", { name: "False", exact: true }).click();
  await expectMove(r, false);
  await expect(sheet.getByText("The statement is true.")).toBeVisible();
  await next();

  // Match the pairs.
  const match = async (pairs: [string, string][]) => {
    for (const [l, rt] of pairs) {
      await page.getByRole("button", { name: l, exact: true }).click();
      await page.getByRole("button", { name: new RegExp(`^${rt}`) }).click();
    }
  };
  r = await rating();
  await match([
    ["Art. 1", "Name of the sample land"],
    ["Art. 7", "Sample rights"],
    ["Art. 9", "Sample duties"],
  ]);
  await expectMove(r, true);
  await next();
  r = await rating();
  await match([
    ["Art. 1", "Sample rights"],
    ["Art. 7", "Name of the sample land"],
    ["Art. 9", "Sample duties"],
  ]);
  await expectMove(r, false);
  await expect(sheet.getByRole("list", { name: "The right pairs" })).toContainText("Art. 7 → Sample rights");
  await next();

  // Put in order.
  r = await rating();
  for (const x of order) await page.getByRole("button", { name: new RegExp(x) }).click();
  await expectMove(r, true);
  await next();
  r = await rating();
  for (const x of [...order].reverse()) await page.getByRole("button", { name: new RegExp(x) }).click();
  await expectMove(r, false);
  await expect(sheet.getByRole("list", { name: "The right order" }).getByRole("listitem").first()).toHaveText(order[0]);
  await next();

  // Pin it on the map.
  await expect(page.getByRole("img", { name: /three lettered places/ })).toBeVisible();
  r = await rating();
  await page.getByRole("button", { name: "Place B" }).click();
  await expectMove(r, true);
  await next();
  r = await rating();
  await page.getByRole("button", { name: "Place A" }).click();
  await expectMove(r, false);
  await expect(sheet.getByText("The right place is B (Strait of Testmore).")).toBeVisible();
  await noSideScroll(page);

  // Leaving sums up the run.
  await page.getByRole("button", { name: "Leave puzzles" }).click();
  const run = page.getByRole("dialog", { name: "Your run" });
  await expect(run.locator(".pz-tiles b").nth(0)).toHaveText("4");
  await expect(run.locator(".pz-tiles b").nth(1)).toHaveText("4");
  await run.getByRole("button", { name: "Keep going" }).click();
  await expect(run).toHaveCount(0);

  const saved = (await savedSince(page, since)).filter((a) => a.kind === "puzzle");
  expect(saved).toHaveLength(8);
  expect(saved.filter((a) => !a.correct)).toHaveLength(4);
  expect(saved.every((a) => a.mode === "practice" && typeof a.delta === "number" && !a.grade)).toBe(true);
});

test("puzzles: the subject filter and the sound switch are remembered", async ({ page }) => {
  await page.goto("/prelims/puzzles");
  await expect(page.locator(".pz-prompt")).toBeVisible();
  await page.getByRole("button", { name: /All subjects/ }).click();
  await page.getByRole("group", { name: "Subjects" }).getByRole("button", { name: "Sample subject" }).click();
  await expect(page).toHaveURL(/subjects=Sample(\+|%20)subject/);
  await expect(page.getByRole("button", { name: /^Sample subject ▾/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Mute sounds" }).click();
  await expect(page.getByRole("button", { name: "Turn sounds on" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("button", { name: "Turn sounds on" }).click();
  await expect(page.getByRole("button", { name: "Mute sounds" })).toBeVisible();
});

test("Rush: three strikes end the run, misses are listed, and the best score survives a reload", async ({ page }) => {
  const since = new Date().toISOString();
  const truth: Record<string, boolean> = {
    "It rises in the north hills.": true,
    "It has no tributaries.": false,
    "Gamma is the capital of the sample state.": true,
    "Delta is the capital of the sample state.": false,
  };
  await page.goto("/prelims/rush");
  const best = page.locator(".rush-best");
  await expect(best).toHaveText(/^Best \d+$/);
  const bestBefore = Number((await best.textContent())!.replace("Best ", ""));
  await page.getByRole("button", { name: "Start" }).click();
  const run = page.getByRole("region", { name: "Run" });
  await expect(run.getByLabel("Time left")).toHaveText(/^(3:00|2:59)$/);

  for (let i = 0; i < 5; i++) {
    const q = (await run.locator(".rush-q").textContent())!;
    const right = i < 2;
    const say = right ? truth[q] : !truth[q];
    await run.getByRole("button", { name: say ? "True" : "False", exact: true }).click();
    if (i < 4) await expect(run.locator(".rush-q-meta")).toContainText(`#${i + 2}`);
  }
  const over = page.getByRole("region", { name: "Run over" });
  await expect(over.getByText("Three strikes")).toBeVisible();
  await expect(over.locator(".rush-score b")).toHaveText("2");
  await expect(over.getByRole("region", { name: "Your misses" }).locator("> div")).toHaveCount(3);
  const bestNow = Math.max(bestBefore, 2);
  await expect(best).toHaveText(`Best ${bestNow}`);
  await noSideScroll(page);

  await page.reload();
  await expect(page.locator(".rush-best")).toHaveText(`Best ${bestNow}`);

  // Rush answers are one run and never move the rating.
  const saved = (await savedSince(page, since)).filter((a) => a.mode === "rush");
  expect(saved).toHaveLength(5);
  expect(new Set(saved.map((a) => a.session)).size).toBe(1);
  expect(saved.some((a) => a.delta !== undefined)).toBe(false);
});
