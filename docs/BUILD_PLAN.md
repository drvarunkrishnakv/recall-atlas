# Build plan: Mains Atlas reader

Each milestone is one branch and one PR, with its own checks and screenshots. The
design target is Mock A · Paper (https://claude.ai/artifact/5L2N2GLe9zD74En3PBBdWU).

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

## M2 · Firebase backend and first deploy

- **You:** create a Firebase project (suggested ID `mains-atlas`), enable Google sign-in
  and Firestore, and run `firebase login` once on this Mac.
- Owner-only Firestore rules, plus tests for them in the Firestore emulator.
- Google sign-in screen; a signed-out visitor sees nothing but the sign-in button.
- `tools/atlas-cli import`: load notes and cards from the notes repo into Firestore.
  Re-create charts and diagrams from the Docs widgets' row data, since the Markdown
  export dropped them.
- PWA manifest and offline cache; deploy to a Hosting preview channel first, then live.
- **Done when** you can sign in on all three devices, read all three notes offline after
  the first load, and a signed-out browser gets no content.

## M3 · Comments, proposals and Claude's loop

- Select text → comment; "Ask Claude" toggle; threads in a popover; resolve.
- Proposals rendered inline in their section with ✓ / ✗; approvals recorded.
- `atlas-cli`: `comments list --open --to-claude`, `comments reply`, `proposals add`,
  `proposals apply`, `notes get/put` with version checks, `export` to the mirror.
- Move the PIB/PRS/Supreme Court feed and matcher (now in the notes repo's tools) to
  write `proposals` instead of Markdown inboxes.
- A scheduled Claude task twice a day (times you choose) running the loop in ARCHITECTURE.md.
- **Done when** a comment you leave at night has a reply and the change by morning, and an
  approved proposal shows up in the note with a history entry.

## M4 · Editing

- **Spike, at most one session:** Milkdown Crepe vs TipTap, judged on card terms,
  chart/mermaid blocks, Markdown round trip and phone usability. Pick one and record it
  in DECISIONS.
- Edit mode with a slash menu for headings, lists, tables, callouts, charts and diagrams.
- Save with a version check (refuse to overwrite a newer version), and a history view
  with restore.
- **Done when** you can add a point on your phone, see it on the Mac, and restore an older version.

## M5 · Grow and retire

- Write more Polity notes directly in the app, then other GS2 subjects.
- Make the Claude Docs copies a read-only archive, and drop the Docs mirror path.
- Optional later: a search box, a "recently updated" list, and printing to PDF.

## Testing on every milestone

- Unit tests for the Markdown extensions and data helpers.
- Playwright smoke tests at desktop, iPad and Android sizes: navigation, back, hover and
  tap cards, comment, approve.
- Screenshots in each PR; light and dark.
