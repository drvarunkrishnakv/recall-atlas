# Handoff

## Hosted MCP server for any AI — 2026-10-17

- **Branch:** `claude/mcp-hosted`, from `main` (fb0254a), with `claude/grok-flags` (PR #32)
  merged in and adapted. Assisting tool: Claude Code.
- **Data cleanup (user's request):** every comment thread (4 Grok flags, 3 Ask Claude tests),
  all 25 discussions, the test capture and the empty P05 were deleted from Firestore. Backup:
  `output/backups/firestore-2026-10-17-before-cleanup/` (git-ignored). The notes repo mirror
  was refreshed with the new pruning export and pushed (8be95b8).
- **Any AI:** bots are AI-neutral (`BOTS` in `src/lib/personas.ts`); `AIS` = grok, gemini,
  chatgpt. Turns carry `ai`; a seat may be pinned with `ai`; a flag's first comment is
  authored by the AI. UI: "AI flag", "Gemini · Reviewer", "Flags from AI reviewers", AI
  colours in the Discuss panel.
- **Server:** `mcp/server.ts` (9 tools: list_notes, search, read_note, read_card, my_turns,
  get_discussion, post_turn, flag, list_flags) over `server/backend.ts`; `mcp/http.ts` shared
  by `mcp/function.ts` (Cloud Function `mcp`, asia-south1, max 2 instances) and
  `mcp/atlas-mcp.ts`. Keys: `server/mcp-keys.ts`, `atlas mcp-key add|list|revoke`.
- **Hosting:** `/mcp` rewrites to the function; `functions/index.js` is built by the
  functions predeploy (`npm run mcp:function`). Use firebase-tools 15 (v13 can't load
  firebase-functions v7).
- **Checks:** `npm run check` (Prettier, `tsc -b`, 56 unit tests, build); `npm run test:cloud`
  13 passed (rules incl. `mcpKeys` closed; cloud API; Admin backend with pruning export;
  HTTP MCP with per-AI keys, refusals, Gemini labelling, seat pinning, revocation);
  `npx playwright test` 42 passed + 12 desktop-only skips. The bundled function answered
  through the Hosting rewrite in the Functions/Hosting emulators (401 without a key; 9 tools).
- **Screenshots:** fixture only, `docs/design/mcp-ai/`.
- **Deployed 2026-10-17** (user approved Blaze and asked for it): function `mcp` (asia-south1)
  and Hosting, from `claude/mcp-hosted`; image cleanup policy 3 days. Live check through
  `https://recall-atlas-511913.web.app/mcp`: 401 without a key, 403 with a browser Origin, a
  test Gemini key identified as Gemini and listed the real notes, then was revoked (401).
  Grok's key `d99d2d20` is in git-ignored `app/.atlas-local/mcp-keys/grok.txt` for the user
  to paste into Grok Bot. Live is ahead of `main` until PR #35 merges.
- **Claude's twice-daily task:** desktop scheduled task `mains-atlas-twice-daily`, 7 am and
  7 pm IST (cron `0 7,19 * * *`), saved in Bypass permissions mode. It answers Ask Claude,
  checks AI flags (no note edits without approval), takes Claude's turns, files captures as
  suggestions, then exports the mirror to the notes repo and pushes it. Runs only while the
  Claude app is open; a missed run happens on next launch.

## Firebase backend (M3) — 2026-10-17

- **Branch:** `claude/firebase-m3`, from `main` (ef69311). Assisting tool: Claude Code.
  Project `recall-atlas-511913`; web config in git-ignored `app/.env.local`, `.firebaserc` git-ignored.
- **App:** `npm run dev:cloud` / `build:cloud` (`--mode cloud`) signs in with Google and
  reads and writes Firestore through the same `api(path)` routes (`src/content/cloud.ts`).
  Signed out you see only the sign-in screen; another account sees "can't open these notes"
  with its account id. Sign-out (top bar) clears the device's offline copy. The local build
  (`dev:fixture`, `dev:notes`, tests) is unchanged and bundles no Firebase.
- **Rules:** `firestore.rules`, owner = custom claim `atlasOwner` (set with `atlas owner`).
- **CLI and MCP:** `server/backend.ts` (files) and `server/firestore-backend.ts` (Admin SDK).
  Without `ATLAS_CONTENT_DIR` they use Firestore and need `~/.config/mains-atlas/service-account.json`.
  New: `atlas import <dir> [--force]`, `atlas export <dir>`, `atlas owner [uid|email] [--remove]`.
- **PWA:** `public/manifest.webmanifest`, icons (green Atlas mark; the old blue favicon is
  gone), `public/sw.js` (app shell only, registered in the cloud build).
- **Hosting:** `firebase.json` (public `app/dist`, SPA rewrite, `build:cloud` predeploy).
- **Checks:** `npm run check` (Prettier, `tsc -b`, 49 unit tests, build); `npm run test:cloud`
  9 passed (rules: owner yes, other account and signed-out no, other collections closed; cloud
  API; Admin backend import/export round trip); `npx playwright test` 41 passed + 10
  desktop-only skips (local build). End-to-end against the
  emulators with Playwright: sign in → refused → `atlas owner` → Try again → notes open, the
  fixture's Markdown pages convert and the CLI sees them at v1; sign out → sign-in screen.
- **Screenshots:** fixture only, `docs/design/m3/` (sign-in and note at desktop, iPad, phone;
  phone refusal).
- **Done 2026-10-17 (with the user's go-ahead):** Firestore `(default)` in asia-south1 (native);
  rules deployed; `atlas import ../output/notes-pilot/content` (15 pages, 5 threads,
  25 discussions, progress, 1 capture); owner claim set on the user's Google account;
  Hosting preview channel `preview` (expires 2026-10-24). Signed-out Firestore REST reads
  return 403. The live site is not deployed.
- **Sign-in on Android:** the first preview sent the redirect through firebaseapp.com and
  Android Chrome's storage partitioning lost its state ("missing initial state"). Every
  Hosting domain now signs in through itself, so each needs its `/__/auth/handler` as a
  redirect URI on the Google OAuth web client: the live `web.app` one and the preview
  channel's (`recall-atlas-511913--preview-2lcp01pe.web.app`, stable for the `preview` channel).
- **Android home-screen app:** redirect sign-in was flaky there (one hang, one return to the
  sign-in button, then success): Chrome can bring the redirect back into another window that
  has lost the pending state. Sign-in now uses a popup everywhere except iPhone/iPad
  home-screen apps (where a popup opens in Safari, outside the app). Not yet retried on the phone.
- **Sync checked:** a comment the user left on Android (Ask Claude, P06) was read from
  Firestore with the CLI, and Claude's reply was written back the same way.
- **Checked by the user:** sign-in and comments from Android (Chrome and the home-screen app)
  and iPad (Chrome); Claude read both comments from Firestore and replied.
- **Live 2026-10-17** (on the user's say-so): `firebase deploy --only hosting` from
  `claude/firebase-m3` (99bd375), https://recall-atlas-511913.web.app. Google accepts its
  sign-in address; signed-out Firestore reads return 403. Redirect URIs on the OAuth web
  client: firebaseapp.com, web.app and the `preview` channel.
- **Scheduled tasks:** none exist yet (no desktop scheduled task, cloud routine, crontab or
  workflow runs the CLI), so nothing reads the stale file copy. The twice-daily task is M4's.
  Checked 2026-10-17 without `ATLAS_CONTENT_DIR`: `atlas comments --waiting`, `atlas turns`,
  `atlas captures` and `atlas export <scratch>` all read Firestore (the Android comment, P05,
  which exists only there). When the task is created it runs the CLI with no
  `ATLAS_CONTENT_DIR` (`env -u ATLAS_CONTENT_DIR` if needed) and ends with
  `npm run atlas -- export ../output/notes-pilot/content` from `app/`, then commits and pushes
  the private notes repo only.
- **Merged:** PR #33 into `main` (7b7ba2c).
- **Next:** not yet tried: the iPad home-screen app (redirect sign-in).
## Grok's flags on notes — 2026-10-17

- **Branch:** `claude/grok-flags`, from `main` (ef69311). Assisting tool: Claude Code.
- **What:** Grok Bot's new **Grok Reviewer** bot (`reviewer`) reviews a note through the
  Atlas MCP server and flags doubtful passages with `atlas_flag`: an exact quote, a level
  (wrong, outdated, unsourced, uncertain), a reason and sources (required for wrong and
  outdated). The server anchors the flag to the block holding the quote, which must appear
  exactly once. Refused: duplicates, more than 10 open flags per bot per note, bad links.
  `atlas_list_flags` shows a note's flags with Claude's verdicts.
- **App:** flags are a new thread kind, `flag` (author `grok`), shown as a red "Grok flag"
  in the margin and panel (new Flags tab), with the level, the bot's name and its sources.
  The quote is highlighted in red. Claude's inbox has a "Flags from Grok" section, and the
  subject table counts flags (⚑). Margin cards now also re-stack when a card's own height changes.
- **Claude's side:** `atlas comments --waiting` lists flags Claude hasn't checked; Claude
  answers with `atlas reply` ("Confirmed" or "Not supported", with a source).
- **Prompt:** `docs/AGENT_PERSONAS.md` → Grok Reviewer.
- **Checks:** 55 unit tests, build, `npx playwright test` 42 passed + 12 desktop-only skips.


## Discussions: Claude and Grok on each note — 2026-10-17

- **Branch:** `claude/discussions`, from `claude/prose-and-citations` (674e091, PR #28). Assisting tool: Claude Code.
- **App:** a "✦ Discuss" button in the note's top bar opens a Notion-style sidebar that floats
  over the text. Tabs: Debate (Claude and Grok Debater on opposite sides, three rounds, you
  vote), Roundtable (Claude moderates and sits as one expert; Grok bots take the other
  seats; two rounds) and Devil's advocate (Grok Devil attacks a claim, Claude defends, three
  rounds). Messages show Claude's or Grok's icon with the role. Every discussion ends with
  Claude's conclusion. You can join any conversation, send a point to Claude's inbox on the
  passage ("To note"), or add your own question.
- **Prepared questions:** 8 per note (3 debates, 2 roundtables, 3 devil claims) for P06, P10
  and P18, written by Claude from each note and its PYQ trail, in the notes repo's
  `content/discussions/`. Not yet argued.
- **Data:** `content/discussions/<collection>-<id>.json`; rules in `src/lib/discussions.ts`
  (seats `{role, by}`, speaking order, conclusion, every argument needs an http(s) source);
  roles and the seven Grok bots in `src/lib/personas.ts`.
- **Atlas MCP server** (`app/mcp/`): Grok bots read and post only their own seats' turns.
  `npm run mcp:build`, then `npm run mcp:http` (127.0.0.1:5190, key in `.atlas-local/mcp-key`,
  `Authorization: Bearer` or `X-API-Key`). Grok Bot runs in the cloud, so it needs a tunnel to
  port 5190 only. A Cloudflare quick tunnel worked on 2026-10-17 (one real Grok turn on P06).
- **Claude's side:** `atlas turns` (briefs every turn that is Claude's), `atlas post <id> "…"
  --source "Label|url"`, `atlas conclude <id> "…"`, `atlas discuss-import <ref> <file>`.
- **Prompts for Grok Bot:** `docs/AGENT_PERSONAS.md` (seven bots, shared rules, a routine).
- **Checks:** Prettier, `tsc -b`, 46 unit tests (incl. the MCP tools), build, and
  `npx playwright test` 35 passed + 10 desktop-only skips (run on an internal-disk copy; the
  external drive stalls tsc).
- **How discussions run:** on demand. The user says "start the debate on …". Claude starts the
  server and tunnel, posts its own turns, messages the right Grok bot in Grok Bot when it's
  that bot's turn, writes the conclusion, then stops both. The twice-daily task catches up
  any Claude turns that were missed.
- **Live runs:** `npm run discuss:serve` starts the server and a quick tunnel, prints the address
  and stops both on Ctrl-C. The address changes each run.
- **Not done yet:** a fixed public address (a Cloudflare named tunnel, once the user has a domain);
  bots' margin notes (Flag/Source/Add/Counterpoint).

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
