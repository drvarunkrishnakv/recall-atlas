import { expect, test, type Page } from "@playwright/test";

// M12: Essay, Ethics case studies, Medical Science, the Mains Notes table and the Claude inbox in
// the Board look. Runs against the synthetic fixture (playwright.config.ts), one worker at a time;
// tests that change shared records use their own topic, case or line per screen size.

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) <= 600;

async function noSideScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
}

/** Opens the Mains sidebar on narrow screens, where it is a drawer. */
async function openNav(page: Page) {
  if ((page.viewportSize()?.width ?? 0) <= 900) await page.getByRole("button", { name: "Open navigator" }).click();
}

const per = <T>(page: Page, desktop: T, ipad: T, phone: T) =>
  isDesktop(page) ? desktop : isPhone(page) ? phone : ipad;

test("the sidebar lists Notes, Essay, Ethics case studies and Medical Science in Mains", async ({ page }) => {
  await page.goto("/");
  await openNav(page);
  const nav = page.locator(".nav");
  for (const name of ["Notes", "Essay", "Ethics case studies", "Medical Science"])
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Essay", exact: true }).click();
  await expect(page).toHaveURL(/\/mains\/essay$/);
  await expect(page.getByRole("heading", { level: 1, name: "Essay" })).toBeVisible();
});

test("each table opens its drawer, and back closes it", async ({ page }) => {
  const screens: [string, string, RegExp | string, string][] = [
    ["/mains/essay", "Essay topics", "Sample topic: a map is not the land it shows.", "Decode the topic"],
    ["/mains/ethics", "Cases", "The sample list", "Case"],
    ["/mains/medical", "Syllabus", "Sample limbs and joints", "Syllabus line"],
    ["/mains/notes", "Polity notes", "Constitutional history & making", "Claude on this note"],
  ];
  for (const [url, table, row, drawer] of screens) {
    await page.goto(url);
    const t = page.getByRole("region", { name: table });
    await t.getByRole("button", { name: row }).first().click();
    const d = page.getByRole("complementary", { name: drawer, exact: true });
    await expect(d).toBeVisible();
    await noSideScroll(page);
    await page.goBack();
    await expect(d).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${url}$`));
  }
});

test("Essay: Claude's breakdown waits for your own angles; a sprint outline is saved and back after a reload", async ({
  page,
}) => {
  const id = per(page, "sample-1", "sample-2", "sample-4");
  await page.goto(`/mains/essay?topic=${id}`);
  const drawer = page.getByRole("complementary", { name: "Decode the topic" });
  await expect(drawer.getByText("Try decoding it yourself first.")).toBeVisible();
  await expect(drawer.getByText("Angles to cover")).toHaveCount(0);
  const show = drawer.getByRole("button", { name: "Show Claude's breakdown" });
  await expect(show).toBeDisabled();
  await drawer.getByLabel("Your keywords and angles").fill("Keywords and two angles of my own");
  await show.click();
  await expect(drawer.getByText("Angles to cover")).toBeVisible();
  await expect(drawer.getByText("Keywords and two angles of my own")).toBeVisible();

  await drawer.getByRole("link", { name: /Outline sprint/ }).click();
  await expect(page).toHaveURL(new RegExp(`/mains/essay/sprint/${id}$`));
  await expect(page.getByRole("timer")).toHaveAccessibleName("20:00 left");
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel("Thesis").fill("My thesis in one line");
  await page.getByLabel("Paragraph 1", { exact: true }).fill("A first point");
  await page.getByRole("button", { name: /Paragraph 1 angle/ }).click();
  const angle = await page.getByRole("button", { name: /Paragraph 1 angle/ }).textContent();
  await page.getByLabel("Paragraph 7", { exact: true }).fill("The other side, answered");
  // Cycle paragraph 7's tag round to "Other side" (after the six angles).
  for (let i = 0; i < 7; i++) await page.getByRole("button", { name: /Paragraph 7 angle/ }).click();
  await expect(page.getByRole("button", { name: /Paragraph 7 angle/ })).toHaveText("Other side");
  await page.getByRole("button", { name: "Check my outline" }).click();
  const check = page.getByRole("list", { name: "Outline check" });
  await expect(check).toContainText("Your thesis takes a position.");
  await expect(check).toContainText("1 of 6 angles covered.");
  await expect(check).toContainText("You argue the other side too.");
  await expect(check).toContainText("Add a closing");
  await expect(page).toHaveURL(/outline=/);
  await noSideScroll(page);

  await page.waitForTimeout(500); // the save is on its way
  await page.reload();
  await expect(page.getByLabel("Thesis")).toHaveValue("My thesis in one line");
  await expect(page.getByLabel("Paragraph 1", { exact: true })).toHaveValue("A first point");
  await expect(page.getByRole("button", { name: /Paragraph 1 angle/ })).toHaveText(angle ?? "");
  await page.goto(`/mains/essay?topic=${id}`);
  await expect(drawer.getByText("Your outlines")).toBeVisible();
  await expect(drawer.getByRole("link", { name: /My thesis in one line/ })).toBeVisible();
});

test("Essay: the full essay timer ends with the Write flow's photo link", async ({ page }) => {
  test.skip(!isDesktop(page), "Once is enough");
  await page.goto("/mains/essay/write/sample-2");
  await expect(page.getByRole("timer")).toHaveText("1:30:00");
  await page.getByRole("button", { name: "Start the 90 minutes" }).click();
  await page.getByRole("button", { name: "I've finished" }).click();
  await expect(page.getByRole("status")).toContainText("Logged");
  await expect(page.getByRole("link", { name: "Send the photos" })).toHaveAttribute(
    "href",
    "/mains/write?essay=sample-2",
  );
  await page.goto("/mains/essay/paper");
  await expect(page.getByRole("button", { name: "Pick one topic in each section" })).toBeDisabled();
  await page.getByRole("radio", { name: /a quiet river/ }).click();
  await page.getByRole("radio", { name: /small steps/ }).click();
  await expect(page.getByRole("button", { name: "Tick all three to start" })).toBeDisabled();
  for (const label of ["16–20 ruled pages", "Phone ready for photos", "Notes and phone away"])
    await page.getByLabel(label).check();
  await expect(page.getByRole("button", { name: "Start the 3 hours" })).toBeEnabled();
});

test("Ethics: the bench goes step by step, and Compare stays locked until you've tried the step", async ({ page }) => {
  test.skip(!isDesktop(page) && !isPhone(page), "Desktop and phone");
  await page.goto("/mains/ethics?case=sample-case-1");
  const drawer = page.getByRole("complementary", { name: "Case", exact: true });
  await expect(drawer.getByText(/written by Claude/i)).toBeVisible();
  await drawer.getByRole("link", { name: /Solve step by step/ }).click();
  await expect(page).toHaveURL(/\/mains\/ethics\/bench\/sample-case-1$/);
  // Once the bench is up, start afresh if another screen size's run left an attempt here.
  await expect(page.getByRole("heading", { name: "1. Stakeholders" })).toBeVisible();
  const fresh = page.getByRole("button", { name: "Start a fresh attempt" });
  if (await fresh.isVisible()) await fresh.click();

  const compare = page.getByRole("button", { name: /Compare with mine/ });
  await expect(compare).toBeDisabled();
  await page.getByRole("button", { name: "Sample families checked" }).click();
  await expect(compare).toBeEnabled();
  await compare.click();
  await expect(page.getByRole("button", { name: /The sample visitor missed/ })).toBeVisible();
  await expect(page.getByText(/more than one defensible answer/)).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "2. Issues and values" })).toBeVisible();
  await expect(compare).toBeDisabled();
  await page.getByRole("button", { name: /Integrity/ }).click();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "3. Options" })).toBeVisible();
  for (const [n, v] of [
    [1, "Never"],
    [2, "Do"],
  ] as const)
    await page
      .getByRole("group", { name: `Your verdict on option ${n}` })
      .getByRole("button", { name: v })
      .click();
  await expect(compare).toBeDisabled(); // option 3 isn't rated yet
  await page.getByRole("group", { name: "Your verdict on option 3" }).getByRole("button", { name: "Do" }).click();
  await compare.click();
  await expect(page.getByText("Claude: Weak · yours: Do")).toBeVisible();
  await expect(page.getByText("Claude: Never · same as yours")).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "4. Decision" })).toBeVisible();
  await expect(compare).toBeDisabled();
  await page.getByLabel("Your decision").fill("Pay the checked families first and put the pressure on record.");
  await compare.click();
  await expect(page.getByText(/What Claude would do/)).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Your fix for the system").fill("Publish the list.");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "6. Write" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Send the photo/ })).toHaveAttribute(
    "href",
    "/mains/write?ethics=sample-case-1",
  );
  await page.getByLabel("Your answer").fill("Four words of answer");
  await expect(page.getByText("4 of 250 words")).toBeVisible();
  await noSideScroll(page);

  // The attempt is kept: the case's drawer counts it.
  await page.waitForTimeout(900);
  await page.goto("/mains/ethics?case=sample-case-1");
  await expect(drawer.getByText(/5 of 5 steps · answer 4 words/).first()).toBeVisible();
});

test("Medical Science: a rating is saved, and the drawer shows the line's PYQs and diagrams", async ({ page }) => {
  const line = per(
    page,
    ["SA1", "Sample limbs and joints"],
    ["SA2", "Sample development"],
    ["SP1", "Sample circulation"],
  );
  await page.goto(`/mains/medical?line=${line[0]}`);
  const drawer = page.getByRole("complementary", { name: "Syllabus line" });
  await expect(drawer.getByRole("heading", { name: line[1] })).toBeVisible();
  const ok = drawer.getByRole("group", { name: "Your rating" }).getByRole("button", { name: "OK" });
  await ok.click();
  await expect(ok).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(500);
  await page.reload();
  await expect(drawer.getByRole("group", { name: "Your rating" }).getByRole("button", { name: "OK" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  if (line[0] === "SA1") {
    await expect(drawer.getByText("Sample nerve plexus")).toBeVisible();
    await expect(drawer.getByText("Sample question: describe a sample joint with a labelled diagram.")).toBeVisible();
    await drawer.getByRole("link", { name: "Draw" }).first().click();
    await expect(page).toHaveURL(/\/mains\/medical\/draw\/SA1\/sample-plexus$/);
    await expect(page.getByRole("timer")).toHaveAccessibleName("3:00 left");
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("status")).toContainText("Logged");
    await expect(page.getByRole("link", { name: "Photograph it" })).toHaveAttribute("href", "/mains/write?medical=SA1");
  }
  await noSideScroll(page);
});

test("Medical Science: a dated syllabus line carries Claude's note", async ({ page }) => {
  test.skip(!isDesktop(page), "Once is enough");
  await page.goto("/mains/medical?paper=II");
  await expect(page.getByRole("button", { name: "Sample programmes and goals" })).toBeVisible();
  await expect(page.getByText("Syllabus dated")).toBeVisible();
  await page.getByRole("button", { name: "Sample programmes and goals" }).click();
  const drawer = page.getByRole("complementary", { name: "Syllabus line" });
  await expect(drawer.getByText(/the syllabus is dated/i)).toBeVisible();
  await expect(drawer.getByText("Not fact-checked yet")).toBeVisible();
});

test("Mains Notes: a paper switch, subject tabs and every planned note with its PYQs and Claude column", async ({
  page,
}) => {
  await page.goto("/mains/notes");
  const table = page.getByRole("region", { name: "Polity notes" });
  await expect(page.getByRole("tab", { name: "GS2", selected: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Polity/, selected: true })).toBeVisible();
  await expect(table.locator(".mx-row")).toHaveCount(24);
  await expect(table.getByText("Constitution & its foundations")).toBeVisible();
  await expect(table.locator('[data-id="P06"]')).toContainText("Written");
  await expect(table.getByText(/Draft next · #1/)).toBeVisible();
  await noSideScroll(page);

  await page.getByRole("tab", { name: "GS1" }).click();
  await expect(page.getByText(/No notes are planned for GS1 yet/)).toBeVisible();
  await page.getByRole("tab", { name: "Medical Science" }).click();
  await page.getByRole("link", { name: "Open Medical Science" }).click();
  await expect(page).toHaveURL(/\/mains\/medical$/);
  // The note pages and subject tables are unchanged.
  await page.goto("/gs2/polity");
  await expect(page.locator(".subject-banner").getByText("24 notes")).toBeVisible();
});

test("the inbox: groups, a proposal's drawer, and Verify, Edit, Reject and add-unverified", async ({ page }) => {
  test.skip(!isDesktop(page), "Proposals are shared; once is enough");
  await page.goto("/notes/P06-study");
  await page.locator(".bn-editor").first().waitFor();
  const { blocks } = await (await page.request.get("/api/pages/notes/P06-study")).json();
  const propose = async (id: string, text: string, extra: Record<string, unknown> = {}) =>
    expect(
      (
        await page.request.post("/api/proposals/notes/P06-study", {
          headers: { "X-Atlas": "1" },
          data: {
            op: "create",
            proposal: {
              id,
              kind: "add",
              blockId: blocks[0].id,
              text,
              source: { label: "Sample digest", url: "https://example.org/digest" },
              reason: `Why ${id}`,
              origin: "claude",
              verification: "secondary",
              confidence: "high",
              ...extra,
            },
          },
        })
      ).ok(),
    ).toBe(true);
  await propose("m12-verify", "Line to verify first");
  await propose("m12-edit", "Line to reword");
  await propose("m12-reject", "Line to reject");
  await propose("m12-unverified", "Line to add unverified");
  await propose("m12-primary", "Line already checked", { verification: "primary", confidence: "medium" });

  await page.goto("/inbox");
  await expect(page.getByText("Needs you").first()).toBeVisible();
  await expect(page.getByText("For your information").first()).toBeVisible();
  await expect(page.getByText("Changes to approve")).toBeVisible();
  const row = (text: string) => page.locator(".mx-row", { hasText: text });
  const drawer = page.getByRole("complementary", { name: "Item", exact: true });

  await row("Line to verify first").click();
  await expect(drawer.getByText("Line to verify first")).toBeVisible();
  await expect(drawer.getByText("Why m12-verify")).toBeVisible();
  await expect(drawer.getByText(/high/).first()).toBeVisible();
  await expect(drawer.getByText(/not yet checked against a primary source/)).toBeVisible();
  await expect(drawer.getByText(/Add to P06-study/)).toBeVisible();
  await drawer.getByRole("button", { name: "Verify, then add" }).click();
  await expect(drawer.getByText(/Goes in once Claude finds the primary source/)).toBeVisible();

  await row("Line to reword").click();
  await drawer.getByRole("button", { name: "Edit" }).click();
  await drawer.getByLabel("Edit the line").fill("My own wording");
  await drawer.getByRole("button", { name: "Save my wording" }).click();
  await expect(drawer.getByText(/Your wording is saved/)).toBeVisible();

  await row("Line to reject").click();
  await drawer.getByRole("button", { name: "Reject" }).click();
  await expect(drawer.getByText("Rejected and logged")).toBeVisible();

  await row("Line to add unverified").click();
  await drawer.getByRole("button", { name: "Add it now, marked unverified" }).click();
  await expect(drawer.getByText(/marked unverified/)).toBeVisible();

  await row("Line already checked").click();
  await drawer.getByRole("button", { name: "Verify, then add" }).click();
  await expect(drawer.getByText(/its primary source was already checked/)).toBeVisible();

  const { proposals } = await (await page.request.get("/api/proposals/notes/P06-study")).json();
  const by = (id: string) => proposals.find((p: { id: string }) => p.id === id);
  expect(by("m12-verify")).toMatchObject({ status: "pending" });
  expect(by("m12-verify").verifyRequested).toBeTruthy();
  expect(by("m12-edit")).toMatchObject({ status: "pending", text: "My own wording" });
  expect(by("m12-reject")).toMatchObject({ status: "rejected" });
  expect(by("m12-unverified")).toMatchObject({ status: "applied", unverified: true });
  expect(by("m12-primary")).toMatchObject({ status: "applied" });
  await page.goto("/notes/P06-study");
  await expect(page.locator(".bn-editor").getByText("Line to add unverified")).toBeVisible();
  await expect(page.locator(".bn-editor").getByText("Line already checked")).toBeVisible();

  // Leave nothing pending for the other tests' proposal counts.
  for (const id of ["m12-verify", "m12-edit"])
    await page.request.post("/api/proposals/notes/P06-study", {
      headers: { "X-Atlas": "1" },
      data: { op: "reject", proposalId: id },
    });
});
