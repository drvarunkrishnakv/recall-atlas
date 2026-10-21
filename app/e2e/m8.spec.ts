import { expect, test, type Page } from "@playwright/test";

// M8, the Mains answer loop: write an answer and send its photo, the marked page, and the Feedback
// tab. Runs against the throwaway copy of the synthetic fixture (playwright.config.ts).

/** Wider screens (desktop, iPad) get the desk; phones the stepper. */
const isWide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 900;

async function noSideScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
}

/** A tiny made-up page photo: ruled paper with one scribbled line (60 × 80 PNG). */
const TINY_PAGE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAADwAAABQCAIAAADKqIEEAAAAcElEQVR42u3SIRIAEABEUfe/iqo6gywrmuIAzLiAYpQ38+OGFzbM0b7XU9zd7wM0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDT0c3Qt+XsHfb93D2hoaGhoaGhoaGhoaGhoaGhoaOhn6AXr5p4k8Iae/QAAAABJRU5ErkJggg==",
  "base64",
);

test("Mains mode's main button writes today's answer, and Feedback is in the sidebar", async ({ page }) => {
  test.skip(!isWide(page) || (page.viewportSize()?.width ?? 0) < 1280, "The sidebar is open on desktops");
  await page.goto("/");
  const nav = page.locator(".nav");
  await nav.getByRole("link", { name: "Today's answer" }).click();
  await expect(page).toHaveURL(/\/mains\/write$/);
  await expect(page.getByText("It asks for")).toBeVisible();
  await nav.getByRole("link", { name: "Feedback" }).click();
  await expect(page).toHaveURL(/\/mains\/feedback$/);
  await expect(page.getByRole("heading", { level: 1, name: "Feedback" })).toBeVisible();
});

test("write an answer: the question, a plan, the timer, a page photo, your score, then waiting for marking", async ({
  page,
}) => {
  const wide = isWide(page);
  await page.goto("/mains/write?q=gs2-2021-sample-tribunal");
  await expect(page.getByText("Sample question: discuss the role of a sample tribunal").first()).toBeVisible();
  await expect(page.getByText("It asks for")).toBeVisible();
  await expect(page.getByText("Examples of disputes it settled")).toBeVisible();
  await expect(page.getByText("250 words · 11 min")).toBeVisible();
  await noSideScroll(page);

  if (wide) {
    await page.getByLabel("1-minute plan · optional").fill("Sample role\nSample examples");
    await page.getByRole("button", { name: "Plan for 1 minute first" }).click();
    await page.getByRole("button", { name: "Start writing" }).click();
  } else {
    await page.getByRole("button", { name: "Plan for 1 minute" }).click();
    await page.getByLabel("Add a point").fill("Sample role");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: "Start the 11-minute timer" }).click();
  }
  const hall = page.getByRole("dialog", { name: "Writing" });
  await expect(hall.getByRole("timer")).toHaveText(/^1[01]:\d\d$/);
  await expect(hall.getByText("Sample role")).toBeVisible();
  await hall.getByRole("button", { name: "I'm done" }).click();
  await expect(page).toHaveURL(/\/mains\/write\?answer=a-/);
  await expect(page.getByText(/You took 0:0\d, inside the time/)).toBeVisible();
  if (wide) await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();

  await page
    .getByLabel("Add a photo of page 1")
    .setInputFiles({ name: "page.png", mimeType: "image/png", buffer: TINY_PAGE });
  await expect(page.getByRole("img", { name: "Page 1", exact: true })).toBeVisible();
  // Photos taken on this device can be turned the right way up (a quarter turn for now).
  await page.getByRole("button", { name: "Turn page 1" }).click();
  await expect(page.getByRole("img", { name: "Page 1", exact: true })).toBeVisible();
  await noSideScroll(page);

  if (!wide) await page.getByRole("button", { name: "Next: your score" }).click();
  await page
    .getByRole("group", { name: "Your score out of 10" })
    .getByRole("button", { name: "6", exact: true })
    .click();
  await page
    .getByRole("group", { name: "What you think you missed" })
    .getByRole("button", { name: "Evidence" })
    .click();
  await page.getByRole("button", { name: "Send for marking" }).click();
  await expect(page.getByRole("heading", { name: "Sent for marking" })).toBeVisible();
  await expect(page.getByText(/next scheduled run/)).toBeVisible();
  await noSideScroll(page);

  // Its page says it waits for the run, with the photo.
  await page.getByRole("link", { name: "Open the answer" }).click();
  const waiting = page.getByRole("region", { name: "Waiting for marking" });
  await expect(waiting.getByText("Claude marks this on its next scheduled run")).toBeVisible();
  await expect(waiting.getByRole("img", { name: "Your page 1" })).toBeVisible();
  await expect(waiting.getByText(/You said 6/)).toBeVisible();
});

test("the marked page: comments on the photo, the checklist, I disagree (kept after a reload), the outline on tap", async ({
  page,
}, info) => {
  // Each screen size disputes a different item, since one item takes one dispute.
  const item = ({ desktop: "Dimensions", ipad: "Evidence", android: "Presentation" } as Record<string, string>)[
    info.project.name
  ];
  await page.goto("/mains/answers/a-20260915-sample01");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sample question: should the chair");
  await expect(page.getByRole("group", { name: "Score" })).toContainText("5/ 10");
  await expect(page.getByRole("group", { name: "Score" })).toContainText("You said 6: a bit generous");
  await expect(page.getByRole("group", { name: "Score" })).toContainText("since 14 Aug (4.5)");

  const marked = page.getByRole("region", { name: "Your page, marked" });
  await expect(marked.getByRole("img", { name: "Your page 1, marked" })).toBeVisible();
  await expect(marked.getByRole("button", { name: /^Comment \d/ })).toHaveCount(6);
  await marked.getByRole("button", { name: "Comment 4, Missing" }).click();
  await expect(marked.getByRole("button", { name: /no recent case/ })).toHaveAttribute("aria-pressed", "true");

  const reading = page.getByRole("region", { name: "Check my reading" });
  await expect(reading.locator("mark")).toHaveText(["walkouts", "sittings"]);

  const checklist = page.getByRole("region", { name: "Where the marks went" });
  await expect(checklist.getByRole("group")).toHaveCount(7);
  await expect(checklist.getByRole("group", { name: "Length" })).toContainText("Mark stands");
  const row = checklist.getByRole("group", { name: item });
  await row.getByRole("button", { name: "I disagree" }).click();
  await row.getByLabel("Why do you disagree?").fill("Sample: my concerns cover a second angle.");
  await row.getByRole("button", { name: "Send to Claude" }).click();
  await expect(row.getByText("Waiting for Claude")).toBeVisible();
  await page.reload();
  const again = page.getByRole("region", { name: "Where the marks went" }).getByRole("group", { name: item });
  await expect(again.getByText("Waiting for Claude")).toBeVisible();
  await expect(again.getByRole("button", { name: "I disagree" })).toHaveCount(0);

  const stronger = page.getByRole("region", { name: "A stronger answer" });
  await expect(stronger.getByRole("list", { name: "A stronger outline" })).toHaveCount(0);
  await stronger.getByRole("button", { name: "Show a stronger outline" }).click();
  await expect(stronger.getByRole("list", { name: "A stronger outline" })).toContainText(
    "Sample outline: an all-party",
  );
  await expect(stronger.getByRole("button", { name: /Rewrite one part/ })).toContainText("What it changes");

  await expect(
    page.getByRole("region", { name: "From your notes" }).getByRole("link", { name: "P06" }).first(),
  ).toBeVisible();
  const attempts = page.getByRole("region", { name: "Your attempts at this question" });
  await expect(attempts.getByRole("link")).toHaveCount(2);
  await expect(attempts.getByText("Same gap both times:")).toBeVisible();
  await noSideScroll(page);
});

test("the Feedback tab: filter by paper and fix tag, the pattern drawer, retry due, and a row opens its page", async ({
  page,
}) => {
  await page.goto("/mains/feedback");
  await expect(page.getByRole("heading", { level: 1, name: "Feedback" })).toBeVisible();
  await expect(page.getByText("Costliest fix")).toBeVisible();
  const table = page.getByRole("region", { name: "All answers" });
  await noSideScroll(page);

  await page.getByRole("group", { name: "Paper" }).getByRole("button", { name: /^GS3/ }).click();
  await expect(page).toHaveURL(/paper=GS3/);
  await expect(table.getByRole("link")).toHaveCount(1);
  await expect(table.getByRole("link")).toContainText("Waiting");
  await page.getByRole("group", { name: "Paper" }).getByRole("button", { name: /^All/ }).click();

  await page
    .getByRole("group", { name: "Fix tags" })
    .getByRole("button", { name: /Thin dimensions/ })
    .click();
  const drawer = page.getByRole("complementary", { name: "Pattern" });
  await expect(drawer.getByRole("heading", { name: "Thin dimensions" })).toBeVisible();
  await expect(drawer.getByText("marks lost")).toBeVisible();
  await expect(drawer.getByText("One or two angles where the question needs four or five.")).toBeVisible();
  await expect(table.getByRole("link")).toHaveCount(2);
  await noSideScroll(page);
  await drawer.getByRole("button", { name: "Close the pattern" }).click();
  await expect(drawer).toHaveCount(0);

  await page.getByRole("button", { name: /Retry due · 1/ }).click();
  await expect(table.getByRole("link")).toHaveCount(1);
  await expect(table.getByRole("link")).toContainText("retry due");
  await table.getByRole("link").click();
  await expect(page).toHaveURL(/\/mains\/answers\/a-20260915-sample01$/);
  await expect(page.getByRole("region", { name: "Where the marks went" })).toBeVisible();
});
