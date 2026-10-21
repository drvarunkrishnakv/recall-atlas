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

test("on wide screens the sidebar folds away, stays folded after a reload, and comes back", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) <= 900, "Phones use the drawer");
  await page.goto("/");
  const home = page.locator(".nav").getByRole("link", { name: "Home" });
  await expect(home).toBeVisible();
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(home).toBeHidden();
  await page.reload();
  await expect(home).toBeHidden();
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(home).toBeVisible();
  await expect(page.getByRole("button", { name: "Show sidebar" })).toHaveCount(0);
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
  if (narrow) await page.locator(".capture-fab").click();
  else {
    // The sidebar's main button is each mode's main action; Capture is in the ··· menu.
    await page.getByRole("button", { name: "More ways to add" }).click();
    await page.getByRole("menuitem", { name: /Capture a thought/ }).click();
  }
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

test("on a phone or tablet, tapping a sticky note's text opens it every time", async ({ page }, info) => {
  test.skip(isDesktop(page), "Desktop shows the cards in the margin");
  const id = `sticky-tap-${info.project.name}`;
  const text = `Tap me again (${info.project.name})`;
  const r = await page.request.post("/api/comments/notes/P06", {
    headers: { "X-Atlas": "1" },
    data: {
      op: "create",
      thread: { id, kind: "sticky", anchor: { blockId: "", quote: "synthetic test content" } },
      comment: { id: `${id}-c`, body: text },
      by: "me",
    },
  });
  expect(r.ok()).toBe(true);
  await page.goto("/notes/P06");
  const mark = page.locator(`.main .bn-thread-mark[data-bn-thread-id="${id}"]`);
  const card = page.locator(".comments-panel .thread", { hasText: text });
  await mark.waitFor();
  await page.waitForLoadState("networkidle");
  for (let round = 0; round < 2; round++) {
    await mark.tap();
    await expect(card, `tap ${round + 1} opens the note`).toBeVisible();
    await page.getByRole("button", { name: "Close comments" }).click();
    await expect(card).toHaveCount(0);
  }
});

test("a sticky note shows only its heading and text; ⋯ holds colour, edit and the rest", async ({ page }) => {
  test.skip(!isDesktop(page), "Once is enough");
  const r = await page.request.post("/api/comments/notes/P06", {
    headers: { "X-Atlas": "1" },
    data: {
      op: "create",
      thread: { id: "paper-pick", kind: "sticky", anchor: { blockId: "", quote: "Second row" } },
      comment: { id: "paper-pick-c", body: "Pick my colour" },
      by: "me",
    },
  });
  expect(r.ok()).toBe(true);
  await page.goto("/notes/P06");
  const card = page.locator('.margin .thread[data-thread="paper-pick"]');
  await expect(card.locator(".paper-title")).toHaveText("Second row");
  await expect(card.locator(".paper-text")).toHaveText("Pick my colour");
  // Nothing else on the face, even when it's opened.
  await card.click();
  for (const name of ["Mint paper", "Edit", "Unpin", "Delete"])
    await expect(card.getByRole("button", { name })).toHaveCount(0);
  await card.getByRole("button", { name: "Sticky note options" }).click();
  await expect(card.getByText("You ·")).toBeVisible();
  await card.getByRole("button", { name: "Mint paper" }).click();
  await expect(card).toHaveClass(/paper-3/);
  await expect(card.getByRole("button", { name: "Mint paper" })).toHaveAttribute("aria-pressed", "true");
  // Edit the text in place.
  await card.getByRole("button", { name: "Edit" }).click();
  await card.getByRole("textbox", { name: "Sticky note text" }).fill("Picked mint");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.locator(".paper-text")).toHaveText("Picked mint");
  await page.reload();
  const again = page.locator('.margin .thread[data-thread="paper-pick"]');
  await expect(again).toHaveClass(/paper-3/);
  await expect(again.locator(".paper-text")).toHaveText("Picked mint");
});

test("a thin bar at the top fills as you read down a note", async ({ page }) => {
  await page.goto("/notes/P06");
  await page.locator(".main .bn-editor h2").first().waitFor();
  const fill = () =>
    page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".read-progress > div");
      return el ? new DOMMatrix(getComputedStyle(el).transform).a : -1;
    });
  expect(await fill()).toBe(0);
  // Scroll to the end (again, if a diagram or chart grows the page meanwhile).
  await expect
    .poll(async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      return fill();
    })
    .toBeGreaterThan(0.95);
  await expect(page.locator(".read-progress")).toHaveCSS("opacity", "1");
});

test("on a phone, dragging the comments sheet down by its top closes it", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 700, "Sheets are a phone thing");
  await page.goto("/notes/P06");
  await page.locator(".main .bn-editor").waitFor();
  await page.getByRole("button", { name: /💬/ }).click();
  const sheet = page.locator(".comments-panel");
  await expect(sheet).toBeVisible();
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); // risen fully
  // A small drag springs back.
  const grab = (await sheet.locator(".sheet-grab").boundingBox())!;
  const x = grab.x + grab.width / 2;
  const y = grab.y + grab.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 40, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(sheet).toBeVisible();
  // A long drag closes it.
  await page.waitForTimeout(400);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 320, { steps: 12 });
  await page.mouse.up();
  await expect(sheet).toHaveCount(0);
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

test("Settings: the gear in the sidebar opens the theme choice, which sticks", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".topbar").getByRole("button", { name: /Theme|Sign out/ })).toHaveCount(0);
  const menu = page.getByRole("button", { name: "Open navigator" });
  if (await menu.isVisible()) await menu.click(); // phones: the sidebar is a drawer
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
  await noSideScroll(page);
});

test("a proposed change is approved into the note, recorded in history, and can be restored away", async ({ page }) => {
  test.skip(!isDesktop(page), "Once is enough");
  await page.goto("/notes/P06");
  await page.locator(".bn-editor").first().waitFor();
  const { blocks } = await (await page.request.get("/api/pages/notes/P06")).json();
  const r = await page.request.post("/api/proposals/notes/P06", {
    headers: { "X-Atlas": "1" },
    data: {
      op: "create",
      proposal: {
        id: "e2e-prop",
        kind: "check",
        blockId: blocks[0].id,
        text: "Confirm the e2e figure",
        source: { label: "PIB", url: "https://pib.gov.in/e2e" },
        reason: "A release adds a figure to confirm.",
        origin: "feed:e2e",
      },
    },
  });
  expect(r.ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: /1 change proposed/ }).click();
  const card = page.locator(".proposal", { hasText: "Confirm the e2e figure" });
  await expect(card).toContainText("From the official-source feed");
  await card.getByRole("button", { name: /Approve/ }).click();
  await expect(page.locator(".bn-editor").getByText("Confirm the e2e figure")).toBeVisible();
  await expect(page.getByRole("button", { name: /change proposed/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "History" }).click();
  const latest = page.locator(".version").first();
  await expect(latest).toContainText("Approved: A release adds a figure to confirm.");
  await latest.locator(".version-head").click();
  await expect(latest.locator(".d-added", { hasText: "Confirm the e2e figure" })).toBeVisible();
  await latest.getByRole("button", { name: /Restore/ }).click();
  await expect(page.locator(".bn-editor").getByText("Confirm the e2e figure")).toHaveCount(0);
});

test("the news heat map opens from Notes; a dot, a river row and a month pick a story", async ({ page }) => {
  await page.goto("/mains/notes");
  await page.getByRole("link", { name: "News heat map" }).click();
  await expect(page).toHaveURL(/\/heat-map$/);
  await expect(page.getByRole("heading", { name: "Which stories lasted", level: 1 })).toBeVisible();
  const card = page.getByRole("complementary", { name: "Selected story" });
  const title = card.getByRole("heading", { level: 2 });
  await expect(title).toHaveText("Sample long-running story");

  // A dot on the chart.
  await page.getByRole("button", { name: /^Sample one-month spike: hot for 1 months/ }).click();
  await expect(title).toHaveText("Sample one-month spike");
  await expect(card).toContainText("Loud but brief");
  await expect(page).toHaveURL(/story=sample-spike/);

  // A river row, then one of its months, which opens in the story's timeline.
  const rivers = page.getByRole("region", { name: "Story rivers" });
  await rivers.getByRole("button", { name: "Sample court case", exact: true }).click();
  await expect(title).toHaveText("Sample court case");
  await rivers.locator('.hm-row.on [data-m="2025-05"]').click();
  await expect(card.locator('li.on[data-m="2025-05"]')).toContainText("May 2025");

  // Exam weight re-scores the chart, and an area narrows it.
  await page.getByRole("button", { name: "Exam weight" }).click();
  await expect(page).toHaveURL(/by=weight/);
  await page.getByRole("button", { name: "Governance", exact: true }).click();
  await expect(page.locator(".hm-dot")).toHaveCount(1);
  await noSideScroll(page);
});

test("the heat map shows past-paper questions on their stories and sums them up", async ({ page }) => {
  await page.goto("/heat-map?story=sample-court");
  const card = page.getByRole("complementary", { name: "Selected story" });
  await expect(card.getByRole("heading", { name: "Past-paper questions" })).toBeVisible();
  await expect(card.locator(".hm-pyq li")).toHaveCount(2);
  await card.getByText("Prelims 2025 · GS1 Q7").click();
  await expect(card.getByText("A sample question about the sample court case.")).toBeVisible();

  const findings = page.getByRole("region", { name: "What UPSC asked" });
  await expect(findings.getByText("Prelims 2025", { exact: true })).toBeVisible();
  await expect(findings.getByText("A sample finding for tests.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Story rivers" }).locator(".hm-mark")).toHaveCount(3);

  await page.getByRole("checkbox", { name: "Ring stories UPSC asked about" }).check();
  await expect(page).toHaveURL(/asked=1/);
  await expect(page.locator(".hm-dot.asked")).toHaveCount(2);
  await noSideScroll(page);
});

test("the Prelims / Mains switch changes the sidebar and remembers each mode's page", async ({ page }) => {
  await page.goto("/gs2/polity");
  const frame = page.locator(".frame");
  const exam = page.getByRole("group", { name: "Exam" });
  await expect(frame).toHaveAttribute("data-mode", "mains");
  await expect(exam.locator('[aria-current="page"]')).toHaveText("Mains");

  await exam.getByRole("link", { name: "Prelims" }).click();
  await expect(page).toHaveURL(/\/prelims$/);
  await expect(frame).toHaveAttribute("data-mode", "prelims");
  await expect(page.getByRole("heading", { level: 1, name: "Prelims" })).toBeVisible();
  await expect(page.getByText(/\d+ days to Prelims|Today to Prelims/)).toBeVisible();
  await expect(page.locator(".nav").getByRole("link", { name: "Claude inbox" })).toHaveCount(0);
  await noSideScroll(page);

  if (isDesktop(page)) {
    // Settings belongs to both modes, so it keeps the one you came from.
    await page.locator(".nav").getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(frame).toHaveAttribute("data-mode", "prelims");
  }

  await exam.getByRole("link", { name: "Mains" }).click();
  await expect(page).toHaveURL(/\/gs2\/polity$/);
  await expect(frame).toHaveAttribute("data-mode", "mains");
  await expect(page.locator(".nav").getByRole("link", { name: "Claude inbox" })).toHaveCount(1);
});

test("a Prelims session: statement marks pick the option, the answer shows, and a miss lands in the notebook", async ({
  page,
}) => {
  await page.goto("/prelims");
  await expect(page.getByRole("link", { name: /Practise now/ })).toBeVisible();
  // The unverified PYQ in the fixture is never served (3 sample questions + M11's 10 in Sample geography).
  await expect(page.getByText(/^13 questions ready/)).toBeVisible();
  // M11's home shows subject tiles rather than every topic.
  await expect(page.getByRole("link", { name: /Sample subject/ })).toBeVisible();
  await noSideScroll(page);

  await page.goto("/prelims/session?items=fx-1,fx-2&mode=practice");
  const card = page.getByRole("region", { name: "Question 1 of 2" });
  await expect(card.getByText("Consider the following statements")).toBeVisible();
  for (const [n, mark] of [
    [1, "Mark true"],
    [2, "Mark true"],
    [3, "Mark false"],
  ] as const)
    await card
      .getByRole("group", { name: `Statement ${n}` })
      .getByRole("button", { name: mark })
      .click();
  await expect(card.getByRole("radio", { name: /1 and 2 only/ })).toHaveAttribute("aria-checked", "true");
  await expect(card.getByText("your marks")).toBeVisible();
  await noSideScroll(page);
  await card.getByRole("button", { name: /Lock in · sure/ }).click();
  await expect(card.getByText("Right: the answer is A.")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Session" }).getByText("+8")).toBeVisible();
  await card.getByRole("button", { name: /Knew it/ }).click();
  await expect(card.getByRole("button", { name: /Knew it/ })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: /Next question/ }).click();

  const second = page.getByRole("region", { name: "Question 2 of 2" });
  await second.getByRole("radio", { name: /Beta/ }).click();
  await second.getByRole("button", { name: /Lock in · unsure/ }).click();
  await expect(second.getByText("Wrong: the answer is C.")).toBeVisible();
  await expect(second.getByText("Gamma is the made-up capital used in tests.")).toBeVisible();
  await second.getByRole("button", { name: /Mixed up/ }).click();
  await second.getByRole("button", { name: /See the summary/ }).click();

  await expect(page.getByRole("heading", { name: "Session done" })).toBeVisible();
  await expect(page.getByText("1 / 2")).toBeVisible();
  await expect(page.getByText("1.3", { exact: true })).toBeVisible();
  await noSideScroll(page);

  // The miss is saved: it is in the notebook after a reload.
  await page.goto("/prelims/notebook");
  await page.reload();
  const list = page.getByRole("navigation", { name: "Missed questions" });
  await list
    .getByRole("button", { name: /Which sample city/ })
    .first()
    .click();
  const detail = page.getByRole("region", { name: "The question" });
  await expect(detail.getByText("your answer")).toBeVisible();
  await expect(detail.getByText("Mixed up").first()).toBeVisible();
  await page.getByRole("tab", { name: "Revision book" }).click();
  await expect(page.getByText("Answer C: Gamma").first()).toBeVisible();
  await noSideScroll(page);
});

test("exam mode holds the answers until the summary, where each one is graded", async ({ page }) => {
  test.skip(!isDesktop(page), "Once is enough");
  await page.goto("/prelims/session?items=fx-3&mode=exam");
  const card = page.getByRole("region", { name: "Question 1 of 1" });
  await expect(card.getByText("Which sample instrument")).toBeVisible();
  await page.keyboard.press("b");
  await expect(card.getByRole("radio", { name: /Barosample/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("s");
  await expect(page.getByRole("heading", { name: "Session done" })).toBeVisible();
  await page.getByRole("region", { name: "Your answers" }).getByRole("button", { name: "Instant" }).click();
  await expect(page.getByRole("button", { name: "Instant" })).toHaveAttribute("aria-pressed", "true");
});
