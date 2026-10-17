# Build plan: Mains Atlas reader

Each milestone is one branch and one PR, with its own checks and screenshots. The
design target is the colourful mock (https://claude.ai/artifact/V5VbeLQ3hFE9LAgjf8k5Pe); M0–M1 used Mock A · Paper.

## M0 · Clean start (this branch: `claude/atlas-reader`)

- Fresh branch from `main`. `main` never received the old graph app; it lived only in
  the unmerged Codex PRs.
- Rewrite the docs for the new product: README, AGENTS, ARCHITECTURE, this plan,
  DECISIONS, HANDOFF and CONTENT_CONVENTIONS.
- **Done when** the docs describe the reader, nothing of the old app remains, and the PR is open.

## M1 · Reader shell (local, no backend)

- Vite + React + TS app in `app/`, with Mock A's tokens (light and dark) and type.
- Sidebar tree, breadcrumbs, back/forward, note page, card page, topic and subject pages.
- Markdown rendering with `[[card|label]]` terms, `chart` blocks and `mermaid` blocks.
- Hover cards on desktop and bottom-sheet cards on touch.
- Content comes from a local folder set by `ATLAS_CONTENT_DIR` (the private notes repo).
  CI uses a small synthetic fixture note committed to the repo.
- CI workflow named `quality`, required by `main`'s protection: format, typecheck,
  unit tests, build, and a check that no content is committed.
- **Done when** all three real notes read well at 1440 px, iPad (1024 px) and Android (412 px)
  widths, in light and dark, with screenshots in the PR.

## M2 · Workspace: editor, side peek and comments (local, this branch: `claude/m2-workspace`)

Moved ahead of Firebase at the user's request: try it on the Mac first.

- BlockNote editor (decision in DECISIONS), with chart, flowchart, callout/Prelims box and
  inline card/note chips; "/" menu for blocks, "@" to link or create a card.
- Pages stored as block JSON plus a Markdown copy, through a local save API with version
  checks and snapshots; Markdown notes converted once (original kept).
- Side peek for card and note links, with back/Escape to close; backlinks on every page.
- Comments: comment / sticky note / Ask Claude; margin on wide screens, panel or sheet
  elsewhere; resolve, reopen, pin, unpin, delete; highlights restored from anchors.
- ⌘K search, sidebar outline, "Start this note" for planned notes.
- Colourful redesign (user's choice, Evernote-inspired): short sidebar with a green Capture
  button, home dashboard, subject database (table / board / due) with status, revision,
  confidence, Claude and comments columns; Revise today and Claude inbox pages.
- Revision tracking (read, mark revised, confidence, spaced due dates) and quick capture,
  stored in `content/progress.json` and `content/captures.json`.
- `app/cli/atlas.ts` for Claude: list waiting threads, reply, show a page, exact-phrase edits,
  list and file captures, show progress.
  Open pages pick up CLI edits when they have nothing unsaved.
- **Done when** you can edit, comment and get a CLI reply on your Mac, with tests at three sizes.

## M3 · Firebase backend and first deploy

Built on `claude/firebase-m3` (2026-10-17): everything below except the deploy, which waits
for the user's say-so. Project `recall-atlas-511913`.

- **You:** create a Firebase project, enable Google sign-in and Firestore, and run
  `firebase login` once on this Mac. Done. Still to do: a service-account key for the CLI.
- Owner-only Firestore rules, plus tests for them in the Firestore emulator.
- Swap the save API for Firestore behind the same store interface (`content/store.ts`,
  `AtlasThreadStore`); import the JSON pages and comment files.
- Google sign-in screen; a signed-out visitor sees nothing but the sign-in button.
- The CLI moves to the Admin SDK and keeps exporting the Markdown copy to the notes repo.
- PWA manifest and offline cache; deploy to a Hosting preview channel first, then live.
- **Done when** you can sign in, read and edit on all three devices, and a signed-out
  browser gets no content.

## M4 · Proposals, history and Claude's loop

Built on `claude/proposals-history-feed` (2026-10-18): proposals with approve/reject, version
history with restore, CLI `propose/proposals/approve/reject/history/restore`, the feed filing
proposals, and the twice-daily task (7 am, 7 pm) using them.

- Proposals rendered inline in their section with ✓ / ✗; approvals recorded.
- Version history view with restore (snapshots already kept since M2).
- CLI: `proposals add/apply`; the PIB/PRS/Supreme Court feed and matcher write proposals
  instead of Markdown inboxes.
- A scheduled Claude task twice a day (times you choose) running the loop in ARCHITECTURE.md.
- **Done when** a comment you leave at night has a reply and the change by morning, and an
  approved proposal shows up in the note with a history entry.

## M5 · Grow and retire

- Write more Polity notes directly in the app, then other GS2 subjects.
- Make the Claude Docs copies a read-only archive, and drop the Docs mirror path.
- Optional later: a "recently updated" list and printing to PDF.
- Later (user's idea, 2026-10-16): a bank of ready introductions and conclusions for each
  microtheme, for answer writing.

## Testing on every milestone

- Unit tests for the Markdown extensions and data helpers.
- Playwright smoke tests at desktop, iPad and Android sizes: navigation, back, hover and
  tap cards, comment, approve.
- Screenshots in each PR; light and dark.
