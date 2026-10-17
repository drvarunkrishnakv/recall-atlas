# Handoff

## Title field fits after the font loads — 2026-10-17

- **Branch:** `claude/title-font-measure`, from `claude/study-file-pages` (2ef561a, PR #29 still
  open), so the PR is stacked on #29 (and #28). Assisting tool: Claude Code.
- **Fix:** the Editing-mode title field (`.title-input`, `app/src/editor/PageView.tsx`) was
  sized before Bricolage Grotesque loaded, so a long title that wraps only in the real font
  showed one line (desktop 1440: box 43 px, text 87 px). A small `useFontsLoaded()` hook
  counts `document.fonts.ready` and each `loadingdone`; the auto-grow effect re-runs on it.
  It still does not resize on every render (that jumps the scroll position).
- **Test:** e2e "a long title's field grows to show every line once the heading font loads"
  opens `/notes/P06-study` with Editing on at all three sizes and checks the title field's
  `scrollHeight <= clientHeight`. Without the fix it fails (desktop 44 px hidden).
- **Checks:** `npm run check` (Prettier, `tsc -b`, 33 unit tests, build) passed;
  `npx playwright test` 37 passed + 8 desktop-only skips. (Run on port 4184 through a
  throwaway config, because another session's tests held 4174; nothing about that is committed.)
- **Screenshots:** fixture only, `docs/design/title-fit/` (desktop, iPad, phone; light;
  Editing on). The title shows both lines at every size.
- **Next:** user review; merge #28, then #29, then this PR.

## Study file pages — 2026-10-17

- **Branch:** `claude/study-file-pages`, from `claude/prose-and-citations` (674e091, PR #28 still
  open), so the PR is stacked on #28. Assisting tool: Claude Code.
- **Scope:** navigation only for the user's "study file" pilot (a long companion page per note).
  A study file is a note with id `<note>-study` and `parent: "<note>"` in its front matter.
  - `locateNote(id, parent)` (`app/src/content/syllabus.ts`) places it under the parent's
    paper › subject › topic; the breadcrumb ends with a link back to the parent note (on
    phones, that link is the one crumb shown). The doc bar shows the parent's topic.
  - Subject tables and counts list only syllabus notes, so study files are not counted.
  - Opening a study file does not mark it read and it has no revision bar: revision stays on
    the parent note.
  - Fixture `app/fixtures/content/notes/P06-study.md` (synthetic); unit test
    `src/content/syllabus.test.ts`; e2e "a study file sits under its parent note…".
  - Recorded in DECISIONS and CONTENT_CONVENTIONS ("Study files (pilot)").
- **Checks:** `npm run check` (Prettier, `tsc -b`, 33 unit tests, build) passed;
  `npx playwright test` 34 passed + 8 desktop-only skips (one earlier run had two context
  teardown timeouts in the citation test on this slow drive; it passed alone and on the
  clean rerun); `tooling/check-public.sh` passed.
- **Screenshots:** fixture only, `docs/design/study-file/` (desktop, iPad, phone; light).
- **Known issue (not from this change):** in Editing mode a long title can show only its first
  line, because the title box is sized before the heading web font loads (box 43 px tall,
  text needs 87 px). Visible in `desktop-study-light.png`. Fixed on `claude/title-font-measure`.
- **Not committed:** anything in `output/notes-pilot` (the real P06 study file stays private).
- **Next:** user review; merge #28 first, then this PR.

## Prose style and citation markers — 2026-10-16

- **Branch:** `claude/prose-and-citations`, from `main` (7fcc48c). Assisting tool: Claude Code.
- **Style guide:** `docs/STYLE_GUIDE.md` (teaching prose, approved by the user). Linked from
  AGENTS, CONTENT_CONVENTIONS and the notes repo's NOTE_TEMPLATE (which keeps the user's
  approved before/after pair).
- **Citations:** new inline `cite` type; `citeLinks()` moves "(Source)" links out of sentences
  into markers (on Markdown conversion and via `atlas cite-sources <ref>`). Markers are
  numbered by CSS counter; a collapsible Sources list sits at the foot of each page; "/Cite a
  source" inserts one. The Markdown copy still writes ` ([Label](url))`.
- **Notes repo (not committed):** P06, P10, P18 reworded to the guide, wording only, checked
  by a script (every URL with its label, card term, note link, number, quote, heading, front
  matter and chart/flowchart unchanged; the only differences are the removed "8 points"
  meta lines, one split bullet, "3 months" → "Three months", and one source label that now
  includes its page numbers). Before/after files and the rewriters' logs are in
  `notes/rewrite/`. Cards' inline sources moved into markers (no rewording).
- **Checks:** `npm run check` (30 unit tests, build) and `npx playwright test` (31 passed, 8 desktop-only skips; a warm-up step now loads the app before tests so cold starts no longer time out).
- **Later (user's idea):** a bank of answer intros and conclusions per microtheme.

## M2 · Workspace: editor, side peek, comments — 2026-10-16

- **Branch:** `claude/m2-workspace`, from `main` (c7a145e). Assisting tool: Claude Code.
- **Built:**
  - BlockNote 0.56 (Mantine UI) editor restyled as Paper; Reading/Editing switch per
    device (touch devices default to Reading); autosave with version checks (409 → reload banner).
  - Atlas blocks: `chart`, `flowchart`, `callout` (note/prelims/warning), inline `term` chips.
    "/" menu adds them; "@" links a card or note, or creates a new card.
  - Side peek (`?peek=card:id`), hover preview on desktop, backlinks ("Cited in" / "Linked from").
  - Comments via BlockNote's comment marks + `AtlasThreadStore`: comment / sticky / Ask
    Claude; margin cards aligned to text at ≥1280 px, panel/sheet below; resolve, reopen,
    pin/unpin, delete; anchors (block id + quote) restore highlights and detect deleted text.
  - ⌘K search, sidebar outline for the open note, "Start this note" from a topic page.
  - Local save API (`app/server/content-api.ts`): loopback-only writes, origin + `X-Atlas`
    header checks, id validation, atomic writes, snapshots every 10 min in `content/history/`.
  - CLI `app/cli/atlas.ts` (`npm run atlas -- …`): pages, show [--ids], comments
    [--waiting|--all], reply (as Claude), replace (one exact phrase, versioned).
- **Redesign (same branch):** colourful Evernote-inspired theme (mock https://claude.ai/artifact/V5VbeLQ3hFE9LAgjf8k5Pe);
  short sidebar with Capture; home dashboard; subject database with Table/Board/Due views,
  filters and inline status/confidence; Revise today; Claude inbox; note page gets a
  revision bar (Mark revised, confidence, next due) and a Contents menu (replaces the
  sidebar outline). New files: `content/progress.json`, `content/captures.json`.
  New CLI commands: `captures`, `file-capture`, `progress`.
- **Content:** the three real notes and 11 cards were converted in the private notes repo
  (`output/notes-pilot/content`): JSON added, `.md` rewritten as the export, originals in
  `content/history/*/original.md`. Word-for-word identical apart from numbered-list markers;
  all terms, charts, flowcharts, tables and links kept. **Not committed in the notes repo yet.**
  Its `tools/build_content.py` would overwrite the `.md` exports; the JSON is now the source.
- **Checks (all passing locally):** `npm run check` (Prettier, `tsc -b`, 26 Vitest tests, build);
  `npx playwright test` 28 passed + 8 desktop-only skips across desktop 1440, iPad 1024 and
  Pixel 7; `tooling/check-public.sh`.
- **Screenshots:** fixture only, `docs/design/m2/` (home, subject, board, note, capture; three sizes; light/dark).
- **Known limits:** Mac only until Firebase; the main bundle is ~1.3 MB (BlockNote + Mantine),
  to lazy-load in M3; no history/restore UI yet; Chromium only in tests.
- **Next:** user review on the Mac; then M3 (Firebase) needs the Firebase project from the user.

## M1 · Reader shell — 2026-10-16

- **Branch:** `claude/m1-reader-shell`, from `main` (e39a6da). Assisting tool: Claude Code.
- **Built:** `app/`, Vite 8 + React 19 + TypeScript 6 + react-router 8, with no backend yet.
  - Paper design (Mock A) in light and dark, with a theme toggle (system/light/dark).
  - Sidebar tree (GS paper → subject → topic → notes), breadcrumbs and back/forward.
  - Pages for home, paper, subject, topic, note, card and the card index.
  - Markdown with `[[card-id|label]]` terms: a hover card on desktop, click to pin, and a bottom sheet on touch.
  - ```` ```chart ```` blocks (line, bar and step/timeline) drawn as SVG from JSON rows.
  - ```` ```mermaid ```` flowcharts, lazy-loaded and themed.
  - On phones the sidebar becomes a drawer and the breadcrumb shows its last item.
- **Content:**
  - Read at dev/build time from `ATLAS_CONTENT_DIR`. `npm run dev:notes` points it at
    `../output/notes-pilot/content` (the private notes repo).
  - That content is built from the Docs mirror by the notes repo's `tools/build_content.py`, which
    restores the six charts/flowcharts from the Docs widgets' data.
  - Without `ATLAS_CONTENT_DIR`, the synthetic fixture in `app/fixtures/content` is used (CI and tests).
- **Checks (all passing locally):**
  - `npm run check`: Prettier, `tsc -b`, 6 Vitest unit tests, build.
  - `npx playwright test`: 12 tests across desktop 1440, iPad 1024 (touch) and Android Pixel 7.
  - `tooling/check-public.sh` on 43 files.
  - CI `quality` runs all of these.
- **Screenshots:** fixture only in `docs/design/m1/`. Real-note screenshots stay local
  (`output/m1-real-shots/`) because note content is private.
- **Known limits:**
  - No sign-in, editing, comments or proposals yet (M2–M4).
  - Not deployed.
  - Chromium emulation only; no physical Android/iPad and no Safari yet.
- **Next:** M2 needs the Firebase project from the user (suggested ID `mains-atlas`).

## M0 · Clean start — 2026-10-16

- **Branch:** `claude/atlas-reader`, from `origin/main` (826d9b9). Assisting tool: Claude Code.
- **Done:**
  - Retired the graph product.
  - Removed the old app's leftover build artifacts from the working tree. Its source never
    reached `main`, so nothing is deleted from git history.
  - Rewrote README, AGENTS, ARCHITECTURE, CONTENT_CONVENTIONS, DECISIONS, and this handoff.
  - Added BUILD_PLAN with milestones M1–M5.
- **Design target:** Mock A · Paper, https://claude.ai/artifact/5L2N2GLe9zD74En3PBBdWU
- **Current content:**
  - Three notes (P06 women's representation, P10 fiscal federalism, P18 presiding officers)
    and 11 concept cards live in Claude Docs.
  - They are mirrored as Markdown in the private repo `drvarunkrishnakv/upsc-mains-atlas-notes`
    (local copy `output/notes-pilot/`), which also holds the PIB/PRS/Supreme Court feed and
    the matcher.
- **Checks:** `quality` workflow runs `tooling/check-public.sh` (no private folders, secrets, personal paths or files over 1 MB). It passes locally, and a planted key, a `data/` file, a service-account file and a personal path were each caught. M1 extends it with format, typecheck, tests and build.
- **PR:** https://github.com/drvarunkrishnakv/recall-atlas/pull/25 (open). The 12 graph-era PRs (#2–#24) are closed with a note; their branches are kept.
- **Open decision for the user:** create the Firebase project (suggested ID `mains-atlas`) before M2.
- **Next action:** M1 reader shell on a new branch, following docs/BUILD_PLAN.md.

## Graph era (superseded)

Handoffs for the old graph app are in the history of the `codex/*` branches and their PRs.
