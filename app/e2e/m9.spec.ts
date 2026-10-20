import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { Lesson } from "../src/lib/lessons.ts";

// M9: tonight's lesson, the morning quiz and the notebook's link to the lesson. Runs against the
// throwaway copy of the synthetic fixture (playwright.config.ts), whose lesson for 20 Oct 2026
// teaches the made-up items fx-1, fx-2 and fx-3.

const DAY = "2026-10-20";
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;
const lessonFile = () => join(process.env.ATLAS_E2E_DIR!, "practice", "lessons", `${DAY}.json`);

/** Puts the fixture lesson back with no ratings, so each test and each screen size starts fresh. */
function resetLesson() {
  mkdirSync(join(process.env.ATLAS_E2E_DIR!, "practice", "lessons"), { recursive: true });
  copyFileSync(
    join(import.meta.dirname, "..", "fixtures", "content", "practice", "lessons", `${DAY}.json`),
    lessonFile(),
  );
}
const ratings = () =>
  (JSON.parse(readFileSync(lessonFile(), "utf8")) as Lesson).ratings.map((r) => `${r.cardId}:${r.rating}`);

async function noSideScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
}

const concept = (page: Page, n: number, name = "") =>
  page.getByRole("article", { name: new RegExp(`^Concept ${n} of 3: ${name}`) });

test("tonight's lesson: cards fling both ways by buttons and keys, undo brings one back, ratings stay", async ({
  page,
}) => {
  resetLesson();
  await page.goto("/prelims/lesson");
  const first = concept(page, 1, "Sample rivers and their tributaries");
  await expect(first).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Tonight's lesson" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Concept 1 of 3" })).toBeVisible();
  // The card opens with your mistake, then the teaching, the table, the hook and the source.
  await expect(first.getByText("Statement 3: “It has no tributaries.”")).toBeVisible();
  await expect(first.getByText("You marked it true")).toBeVisible();
  await expect(first.getByText("It is false")).toBeVisible();
  await expect(first.getByRole("table")).toBeVisible();
  await expect(first.getByText("Every sample river has tributaries.")).toBeVisible();
  await expect(first.getByRole("link", { name: /Sample atlas/ })).toBeVisible();
  await expect(first.getByText("Not fact-checked")).toHaveCount(0);
  await noSideScroll(page);

  await page.getByRole("button", { name: "Got it" }).click();
  await expect(concept(page, 2, "Capitals of the sample states")).toBeVisible();
  await expect(page.getByRole("img", { name: "Concept 2 of 3" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  const third = concept(page, 3, "Measuring sample pressure");
  await expect(third).toBeVisible();
  // A card that hasn't passed the fact-check says so.
  await expect(third.getByText("Not fact-checked")).toBeVisible();
  await expect.poll(ratings).toEqual(["sample-river-tributaries:got", "sample-capitals:shaky"]);

  await page.getByRole("button", { name: "Undo last card" }).click();
  await expect(concept(page, 2, "Capitals")).toBeVisible();
  await expect.poll(ratings).toEqual(["sample-river-tributaries:got"]);
  await page.keyboard.press("ArrowRight");
  await expect(concept(page, 3)).toBeVisible();
  await expect.poll(ratings).toEqual(["sample-river-tributaries:got", "sample-capitals:got"]);

  // Saved: a reload opens on the first card you haven't rated.
  await page.reload();
  await expect(concept(page, 3, "Measuring")).toBeVisible();
  await page.getByRole("button", { name: "Still shaky" }).click();
  await expect(page.getByRole("heading", { name: "Done for tonight" })).toBeVisible();
  await expect(page.getByText("1 concept is still shaky, so it comes back sooner.")).toBeVisible();
  await expect(page.getByText(/Your quiz is ready tomorrow morning: 3 questions/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Morning quiz" }).last()).toHaveAttribute(
    "href",
    `/prelims/quiz?day=${DAY}`,
  );
  await noSideScroll(page);

  // Undo works from the summary too.
  await page.getByRole("button", { name: "Undo last card" }).click();
  await expect(concept(page, 3)).toBeVisible();
  await expect.poll(ratings).toEqual(["sample-river-tributaries:got", "sample-capitals:got"]);
});

test("dragging a card far enough flings it; a short drag springs back", async ({ page }) => {
  resetLesson();
  await page.goto("/prelims/lesson");
  const first = concept(page, 1);
  await expect(first).toBeVisible();
  const box = (await first.getByRole("heading").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const drag = async (dx: number) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + 2, { steps: 5 });
    await page.mouse.move(x + dx, y + 4, { steps: 5 });
    await page.mouse.up();
  };
  await drag(40);
  await expect(first).toBeVisible();
  expect(ratings()).toEqual([]);
  await drag(-170);
  await expect(concept(page, 2)).toBeVisible();
  await expect.poll(ratings).toEqual(["sample-river-tributaries:shaky"]);
  await drag(170);
  await expect(concept(page, 3)).toBeVisible();
  await expect.poll(ratings).toEqual(["sample-river-tributaries:shaky", "sample-capitals:got"]);
  await noSideScroll(page);

  // With reduced motion, the card leaves without a flight.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByRole("heading", { name: "Done for tonight" })).toBeVisible();
  await expect(page.locator(".ls-ghost")).toHaveCount(0);
});

test("the morning quiz runs the lesson's questions and saves them as quiz answers", async ({ page }) => {
  resetLesson();
  const quizAnswers = async () => {
    const r = await page.request.get("/api/practice");
    const { days } = (await r.json()) as { days: Record<string, { itemId: string; mode: string }[]> };
    return Object.values(days)
      .flat()
      .filter((a) => a.mode === "quiz")
      .map((a) => a.itemId);
  };
  const before = await quizAnswers();

  await page.goto("/prelims/quiz");
  const panel = page.getByRole("complementary", { name: "Session" });
  await expect(panel.getByText("Morning quiz")).toBeVisible();
  const q1 = page.getByRole("region", { name: "Question 1 of 3" });
  await expect(q1.getByText("Consider the following statements about the sample river")).toBeVisible();
  await q1.getByRole("radio", { name: /1 and 2 only/ }).click();
  await q1.getByRole("button", { name: /Lock in · sure/ }).click();
  await expect(q1.getByText("Right: the answer is A.")).toBeVisible();
  await q1.getByRole("button", { name: /Next question/ }).click();
  const q2 = page.getByRole("region", { name: "Question 2 of 3" });
  await q2.getByRole("radio", { name: /Beta/ }).click();
  await q2.getByRole("button", { name: /Lock in · unsure/ }).click();
  await expect(q2.getByText("Wrong: the answer is C.")).toBeVisible();
  await q2.getByRole("button", { name: /Mixed up/ }).click();
  await q2.getByRole("button", { name: /Next question/ }).click();
  const q3 = page.getByRole("region", { name: "Question 3 of 3" });
  await q3.getByRole("radio", { name: /Barosample/ }).click();
  await q3.getByRole("button", { name: /Lock in · sure/ }).click();
  await q3.getByRole("button", { name: /See the summary/ }).click();
  await expect(page.getByRole("heading", { name: "Session done" })).toBeVisible();
  await expect(page.getByText("2 / 3")).toBeVisible();
  await noSideScroll(page);

  await expect.poll(async () => (await quizAnswers()).length).toBe(before.length + 3);
  expect((await quizAnswers()).slice(-3).sort()).toEqual(["fx-1", "fx-2", "fx-3"]);
});

test("the sidebar and the Mistake notebook lead to tonight's lesson card on a missed question", async ({ page }) => {
  resetLesson();
  // A made-up miss on fx-2, saved the way the session saves one.
  const day = new Date().toLocaleDateString("en-CA");
  const r = await page.request.post(`/api/practice/attempts/${day}`, {
    headers: { "X-Atlas": "1" },
    data: {
      op: "add",
      attempt: {
        id: `fx-2-m9-${Date.now().toString(36)}`,
        itemId: "fx-2",
        bank: "fixture-sample",
        kind: "mcq",
        at: new Date().toISOString(),
        ms: 15_000,
        mode: "practice",
        correct: false,
        sure: true,
        chosen: 1,
        delta: -7,
      },
    },
  });
  expect(r.ok()).toBe(true);

  if (isDesktop(page)) {
    await page.goto("/prelims");
    const nav = page.locator(".nav");
    await expect(nav.getByRole("link", { name: "Morning quiz" })).toBeVisible();
    await nav.getByRole("link", { name: "Tonight's lesson" }).click();
    await expect(page).toHaveURL(/\/prelims\/lesson$/);
    await expect(concept(page, 1)).toBeVisible();
  }

  await page.goto("/prelims/notebook");
  await page
    .getByRole("navigation", { name: "Missed questions" })
    .getByRole("button", { name: /Which sample city/ })
    .first()
    .click();
  const detail = page.getByRole("region", { name: "The question" });
  await detail.getByRole("link", { name: "Tonight's lesson on this" }).click();
  await expect(page).toHaveURL(new RegExp(`/prelims/lesson\\?day=${DAY}&card=sample-capitals$`));
  await expect(concept(page, 2, "Capitals of the sample states")).toBeVisible();
  await noSideScroll(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/prelims\/notebook/);
});
