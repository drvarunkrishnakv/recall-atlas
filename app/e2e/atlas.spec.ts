import { execFileSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Runs against a throwaway copy of the synthetic fixture (see playwright.config.ts), one
// worker at a time, because tests save to the same pages.

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;

async function noSideScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
}

/** The page title, whether shown as a heading (reading) or a title field (editing). */
async function expectTitle(scope: Locator, text: string) {
  await expect
    .poll(() =>
      scope
        .locator("h1, .title-input")
        .first()
        .evaluate((el) => (el instanceof HTMLTextAreaElement ? el.value : el.textContent)),
    )
    .toBe(text);
}

/** Selects the first occurrence of `text` inside the editor, as a reader would by dragging. */
async function selectText(page: Page, text: string) {
  await page.locator(".main .bn-editor").waitFor();
  await page.evaluate((needle) => {
    const root = document.querySelector(".main .bn-editor")!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf(needle);
      if (i >= 0) {
        window.getSelection()!.setBaseAndExtent(n, i, n, i + needle.length);
        return;
      }
    }
    throw new Error(`Text not found: ${needle}`);
  }, text);
}

/** Puts the caret right after `text` in the editor (End scrolls the page on macOS). */
async function caretAfter(page: Page, text: string) {
  await page.locator(".main .bn-editor").waitFor();
  await page.evaluate((needle) => {
    const root = document.querySelector<HTMLElement>(".main .bn-editor")!;
    root.focus();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf(needle);
      if (i >= 0) {
        window.getSelection()!.collapse(n, i + needle.length);
        return;
      }
    }
    throw new Error(`Text not found: ${needle}`);
  }, text);
}

async function startComment(page: Page, quote: string) {
  await selectText(page, quote);
  const toolbarButton = page.locator('.bn-formatting-toolbar [data-test="addcomment"]');
  const bubble = page.locator(".comment-bubble");
  await expect(toolbarButton.or(bubble)).toHaveCount(1);
  await expect(toolbarButton.or(bubble)).toBeVisible();
  if (await bubble.isVisible()) await bubble.click();
  else await toolbarButton.click();
  await expect(page.locator(".composer")).toBeVisible();
}

test("home → subject table → note in single clicks, and back works", async ({ page }) => {
  await page.goto("/");
  const narrow = (page.viewportSize()?.width ?? 1440) <= 900;
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(/Good (morning|afternoon|evening)/);
  await main
    .getByRole("link", { name: /Polity/ })
    .first()
    .click();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Polity");
  await expect(main.getByRole("button", { name: /Constitution & its foundations/ })).toBeVisible();
  await main.getByRole("link", { name: "Fixture note: how a sample topic reads" }).click();
  await expectTitle(main, "Fixture note: how a sample topic reads");
  await noSideScroll(page);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Polity");
  if (narrow) {
    await page.getByRole("button", { name: "Open navigator" }).click();
    await expect(page.locator(".frame.nav-open")).toBeVisible();
  }
});

test("the subject database has table, board and due views", async ({ page }) => {
  await page.goto("/gs2/polity");
  const main = page.locator("main");
  // 23 planned notes, or 22 once the "start a note" test has run on desktop.
  expect(await main.getByRole("button", { name: "Start this note" }).count()).toBeGreaterThanOrEqual(22);
  await main.getByRole("button", { name: /Constitution & its foundations/ }).click();
  await expect(main.getByText("Constitutional history & making")).toHaveCount(0);
  await main.getByRole("tab", { name: "Board" }).click();
  await expect(main.locator(".lane-in-review").getByText("Fixture note: how a sample topic reads")).toBeVisible();
  await main.getByRole("tab", { name: "Due" }).click();
  await expect(page).toHaveURL(/view=due/);
});

test("a study file sits under its parent note and is not counted as a note", async ({ page }) => {
  await page.goto("/gs2/polity");
  const main = page.locator("main");
  // 24 planned notes; on desktop (first, before a note is started) only the fixture note is written.
  const banner = main.locator(".subject-banner");
  await expect(banner.getByText("24 notes")).toBeVisible();
  if (isDesktop(page)) await expect(banner.getByText("1 written")).toBeVisible();
  await expect(main.getByText("Fixture study file: the long companion page")).toHaveCount(0);

  await page.goto("/notes/P06-study");
  await expectTitle(main, "Fixture study file: the long companion page");
  await expect(main.locator(".doc-bar").getByText("GS2 · Polity · 01")).toBeVisible();
  await expect(main.locator(".study-bar")).toHaveCount(0);
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  if (isDesktop(page))
    await expect(crumbs.getByRole("link")).toHaveText([
      "GS2",
      "Polity",
      "01 Constitution & its foundations",
      "Women's political representation & reservation",
    ]);
  await noSideScroll(page);
  await crumbs.getByRole("link", { name: "Women's political representation & reservation" }).click();
  await expect(page).toHaveURL(/\/notes\/P06$/);
  await expectTitle(main, "Fixture note: how a sample topic reads");
});

test("a long title's field grows to show every line once the heading font loads", async ({ page }) => {
  // Editing on at every size, so the title is the auto-grown field rather than a heading.
  await page.addInitScript(() => localStorage.setItem("atlas-editing", "on"));
  await page.goto("/notes/P06-study");
  const title = page.locator("main .title-input");
  await expectTitle(page.locator("main"), "Fixture study file: the long companion page");
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => title.evaluate((el) => el.scrollHeight - el.clientHeight), { timeout: 5_000 })
    .toBeLessThanOrEqual(0);
});

test("quick capture lands in the scratch pad, and Claude's filing shows in the inbox", async ({ page }, info) => {
  await page.goto("/");
  const text = `Capture from ${info.project.name}`;
  const narrow = (page.viewportSize()?.width ?? 1440) <= 900;
  await page.locator(narrow ? ".capture-fab" : ".capture-btn").click();
  await page.getByRole("textbox", { name: "What did you notice?" }).fill(text);
  await page.getByRole("button", { name: "Save to scratch pad" }).click();
  const item = page.locator(".captures li", { hasText: text });
  await expect(item).toContainText("Waiting for Claude");
  if (!isDesktop(page)) return;
  const id = await page.evaluate(
    (t) =>
      fetch("/api/captures")
        .then((r) => r.json())
        .then((d) => d.captures.find((c: { text: string }) => c.text === t).id),
    text,
  );
  execFileSync("node", ["cli/atlas.ts", "file-capture", id, "Added to State of play.", "P06"], {
    env: { ...process.env, ATLAS_CONTENT_DIR: process.env.ATLAS_E2E_DIR },
  });
  await page.goto("/inbox");
  await expect(page.locator(".inbox-card", { hasText: text })).toContainText("Filed into P06");
});

test("marking a note revised sets its next due date", async ({ page }) => {
  test.skip(!isDesktop(page), "Revision state is shared; once is enough");
  await page.goto("/notes/P06");
  const bar = page.locator(".study-bar");
  await expect(bar).toContainText("next due tomorrow");
  await bar.getByRole("button", { name: "Mark revised" }).click();
  await expect(bar).toContainText("Revised 1×");
  await bar.getByRole("combobox", { name: "Confidence" }).selectOption("weak");
  await expect(bar).toContainText("next due");
  await page.goto("/revise");
  await expect(page.locator(".due-item", { hasText: "Fixture note" })).toBeVisible();
});

test("the converted note shows its table, chart, flowchart and outline", async ({ page }) => {
  await page.goto("/notes/P06");
  const main = page.locator("main");
  await expect(main.getByText("Sample row")).toBeVisible();
  await expect(main.locator("figure.visual svg").first()).toBeVisible();
  await expect(main.locator(".mermaid-box svg")).toBeVisible({ timeout: 15_000 });
  await main.getByRole("button", { name: "Contents" }).click();
  await expect(main.locator(".contents-menu").getByText("Evidence bank")).toBeVisible();
  await noSideScroll(page);
});

test("a card term opens in the side peek; back closes it", async ({ page }) => {
  await page.goto("/notes/P06");
  if (isDesktop(page)) {
    await page.locator('.main [data-term="card:sample-card"]').first().hover();
    await expect(page.locator(".pop h4")).toHaveText("Sample card (fixture)");
  }
  await page.locator('.main [data-term="card:sample-card"]').first().click();
  await expect(page).toHaveURL(/peek=card%3Asample-card/);
  const peek = page.locator(".peek");
  await expectTitle(peek, "Sample card (fixture)");
  await expect(peek.getByRole("button", { name: "Fixture note: how a sample topic reads" })).toBeVisible();
  await page.goBack();
  await expect(peek).toHaveCount(0);
  await noSideScroll(page);
});

test("a sticky note is saved, shown beside its text and restored after reload", async ({ page }, info) => {
  await page.goto("/notes/P06");
  const text = `Sticky from ${info.project.name}`;
  await startComment(page, "It exercises every block");
  await page.getByRole("radio", { name: /Sticky note/ }).click();
  await page.locator(".composer textarea").fill(text);
  await page.getByRole("button", { name: "Add sticky note" }).click();
  await expect(page.locator(".thread", { hasText: text })).toBeVisible();
  await page.reload();
  await expect(page.locator(".main .bn-thread-mark:not([data-orphan])").first()).toBeVisible();
  if (!isDesktop(page)) await page.getByRole("button", { name: /💬/ }).click();
  await expect(page.locator(".thread.kind-sticky", { hasText: text })).toBeVisible();
});

test("Ask Claude: Claude's reply from the CLI appears in the thread", async ({ page }) => {
  test.skip(!isDesktop(page), "One run is enough for the CLI round trip");
  await page.goto("/notes/P06");
  await startComment(page, "Second row");
  await page.getByRole("radio", { name: /Ask Claude/ }).click();
  await page.locator(".composer textarea").fill("Why is this row here?");
  await page.getByRole("button", { name: "Ask Claude" }).click();
  const thread = page.locator(".thread.kind-claude", { hasText: "Why is this row here?" });
  await expect(thread.getByText("Waiting for Claude's next run")).toBeVisible();
  const id = await thread.getAttribute("data-thread");
  execFileSync("node", ["cli/atlas.ts", "reply", "notes/P06", id!, "Because the fixture needs two rows."], {
    env: { ...process.env, ATLAS_CONTENT_DIR: process.env.ATLAS_E2E_DIR },
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await thread.click();
  await expect(thread.getByText("Because the fixture needs two rows.")).toBeVisible();
});

test("editing: typing saves, and the slash and @ menus insert Atlas blocks", async ({ page }) => {
  test.skip(!isDesktop(page), "Editing is checked once, on desktop");
  await page.goto("/notes/P06");
  const editor = page.locator(".main .bn-editor");
  await caretAfter(page, "real notes live in a private repository.");
  await page.keyboard.type(" Added by the test.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/chart");
  await expect(page.locator(".bn-suggestion-menu").getByText("Chart", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.locator(".visual-block").getByText("New chart")).toBeVisible();
  await caretAfter(page, "Added by the test.");
  await page.keyboard.type(" See @Sample");
  await expect(page.locator(".bn-suggestion-menu").getByText("Sample card (fixture)")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.locator('[data-term="card:sample-card"]')).toHaveCount(3);
  await expect(page.locator(".save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();
  await expect(page.locator(".main").getByText("Added by the test.")).toBeVisible();
  await expect(page.locator(".main .visual-block").getByText("New chart")).toBeVisible();
});

test("search finds a card and opens it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("textbox", { name: "Search" }).fill("sample card");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/cards\/sample-card$/);
  await expectTitle(page.locator("main"), "Sample card (fixture)");
});

test("a planned note can be started from its topic", async ({ page }) => {
  test.skip(!isDesktop(page), "Creates a page; once is enough");
  await page.goto("/gs2/polity");
  await page.getByRole("button", { name: "Start this note" }).first().click();
  await expect(page).toHaveURL(/\/notes\/P01$/);
  await expectTitle(page.locator("main"), "Constitutional history & making");
  await expect(page.locator(".main").getByText("State of play")).toBeVisible();
});

test("sources show as numbered markers with a sources list", async ({ page }) => {
  await page.goto("/notes/P06");
  const main = page.locator("main");
  const marker = main.getByRole("button", { name: "Source: Sample source" });
  await expect(marker).toBeVisible();
  await expect(main.locator(".bn-editor")).not.toContainText("Sample source");
  await marker.click();
  await expect(page.locator(".cite-pop")).toContainText("example.org");
  await main.getByText(/^Sources \(\d+\)$/).click();
  await expect(main.locator(".sources li")).toHaveCount(2);
});

test("unknown pages say so", async ({ page }) => {
  await page.goto("/notes/NOPE");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
});

/** An AI bot's turn (Grok's by default), as the Atlas MCP server would post it. */
async function grokTurn(page: Page, discussionId: string, by: string, body: string, ai = "grok") {
  const r = await page.request.post("/api/discussions/notes/P06", {
    headers: { "X-Atlas": "1" },
    data: {
      op: "turn",
      discussionId,
      turn: { id: `t-${by}-${Date.now()}`, by, ai, body, sources: [{ label: "PRS", url: "https://prsindia.org/" }] },
    },
  });
  expect(r.ok()).toBe(true);
}

/** Claude's turn, posted through the CLI as Claude's scheduled task does. */
function claudeTurn(discussionId: string, body: string) {
  execFileSync("node", ["cli/atlas.ts", "post", discussionId, body, "--source", "PRS|https://prsindia.org/"], {
    env: { ...process.env, ATLAS_CONTENT_DIR: process.env.ATLAS_E2E_DIR },
  });
}

async function openDiscuss(page: Page, tab: "Debate" | "Roundtable" | "Devil") {
  await page.getByRole("button", { name: "Discuss with Claude and other AIs" }).click();
  const panel = page.locator(".ds-panel");
  await panel.getByRole("tab", { name: new RegExp(tab) }).click();
  return panel;
}

async function discussionId(page: Page, topic: string): Promise<string> {
  const { discussions } = await (await page.request.get("/api/discussions/notes/P06")).json();
  return discussions.find((x: { topic: string }) => x.topic === topic).id;
}

const refresh = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("focus")));

test("devil's advocate: Grok attacks, Claude defends, you join in", async ({ page }, info) => {
  await page.goto("/notes/P06");
  const panel = await openDiscuss(page, "Devil");
  const claim = `Markers make sources easy to check (${info.project.name})`;
  await panel.getByRole("button", { name: /Ask your own claim/ }).click();
  await panel.locator(".ds-addform textarea").fill(claim);
  await panel.getByRole("button", { name: "Start" }).click();
  await expect(panel.locator(".ds-motion")).toHaveText(claim);
  await expect(panel.locator(".ds-msg.waiting")).toContainText("Devil's advocate");

  const id = await discussionId(page, claim);
  await grokTurn(page, id, "devil", "A marker shows a source exists, not that it supports the claim.");
  await refresh(page);
  await expect(panel.locator(".ds-msg.grok")).toContainText("not that it supports the claim");
  claudeTurn(id, "A blind check reads every source against its claim before a note goes live.");
  await refresh(page);
  await expect(panel.locator(".ds-msg.claude:not(.waiting)")).toContainText("A blind check reads every source");
  await expect(panel.locator(".ds-msg.claude:not(.waiting)")).toContainText("Defends the note");

  await panel.locator(".ds-compose textarea").fill("And who checks the checker?");
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(panel.locator(".ds-msg.me")).toContainText("And who checks the checker?");
  await expect(panel.locator(".ds-msg.waiting")).toContainText("Grok");
  await noSideScroll(page);
});

test("roundtable: Claude opens, and a point goes to Claude's inbox on the section", async ({ page }) => {
  test.skip(!isDesktop(page), "Once is enough");
  await page.goto("/notes/P06");
  const panel = await openDiscuss(page, "Roundtable");
  await panel.getByRole("button", { name: /Ask your own question/ }).click();
  await panel.locator(".ds-addform textarea").fill("Who gains from sample rows?");
  await panel.getByRole("button", { name: "Start" }).click();
  const id = await discussionId(page, "Who gains from sample rows?");
  claudeTurn(id, "Today we ask who gains from sample rows, from law, economics and politics.");
  await refresh(page);
  await expect(panel.locator(".ds-msg.claude:not(.waiting)")).toContainText("Moderator");
  await panel.getByRole("button", { name: /Save to note/ }).click();
  await expect(panel.getByText("Sent to Claude's inbox")).toBeVisible();
  await expect(page.locator(".thread.kind-claude", { hasText: "Claude · Moderator said" })).toBeVisible();
});

test("an AI's flag shows in the margin with its level and AI, and in Claude's inbox", async ({ page }) => {
  test.skip(!isDesktop(page), "Once is enough");
  const r = await page.request.post("/api/comments/notes/P06", {
    headers: { "X-Atlas": "1" },
    data: {
      op: "create",
      thread: {
        id: "flag-e2e",
        kind: "flag",
        anchor: { blockId: "", quote: "Plain text with a source" },
        flag: { by: "reviewer", level: "uncertain", sources: [{ label: "PRS", url: "https://prsindia.org/" }] },
      },
      comment: { id: "flag-e2e-c", body: "Which source backs this row?" },
      by: "gemini",
    },
  });
  expect(r.ok()).toBe(true);
  await page.goto("/notes/P06");
  const card = page.locator(".margin .thread.kind-flag");
  await expect(card).toContainText("AI flag");
  await expect(card).toContainText("Uncertain");
  await expect(card).toContainText("Gemini · Reviewer");
  await expect(page.locator('.bn-thread-mark[data-bn-thread-id="flag-e2e"]')).toHaveText("Plain text with a source");
  await page.goto("/inbox");
  await expect(page.getByText("Flags from AI reviewers")).toBeVisible();
  await expect(page.getByText("Gemini: Which source backs this row?")).toBeVisible();
});

test("a note still opens when a thread has a kind this build doesn't know", async ({ page }) => {
  test.skip(!isDesktop(page), "Once is enough");
  const r = await page.request.post("/api/comments/notes/P06", {
    headers: { "X-Atlas": "1" },
    data: {
      op: "create",
      thread: { id: "future-kind", kind: "poll", anchor: { blockId: "", quote: "Sample row" } },
      comment: { id: "future-kind-c", body: "A thread from a newer version." },
      by: "me",
    },
  });
  expect(r.ok()).toBe(true);
  await page.goto("/notes/P06");
  await expect(page.locator(".bn-editor").first()).toBeVisible();
  await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
  await expect(page.locator(".thread", { hasText: "A thread from a newer version." }).first()).toBeVisible();
});
