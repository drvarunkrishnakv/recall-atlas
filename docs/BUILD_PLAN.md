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

## Prelims and Mains practice (from 2026-10-20)

The user asked for one study system for CSE 2027: a Prelims mode and a Mains mode in this app.
Each step below is one milestone and one PR. Screens follow the mocks the user chose on the
design canvas (https://claude.ai/artifact/5L9F2MBYd2QSETo5r485cQ); the reasons are in
DECISIONS (2026-10-20).

### M6 · Practice foundations (this branch: `claude/practice-foundations`)

- Board shell: the sidebar, the top bar and a Prelims/Mains switch in the Board look, in light
  and dark, green for Prelims and amber for Mains. Note pages keep their reading style.
- Prelims mode under `/prelims`, with its own sidebar. Mains keeps every existing route. The
  switch remembers the last page of each mode.
- Data shapes for items and attempts (`app/src/lib/practice.ts`), their Firestore documents, and
  owner-only rules with emulator tests.
- **Done when** the switch works at all three sizes in light and dark, the existing tests pass,
  and the shapes have unit and rules tests.

### M7 · Prelims MCQ loop

- The practice session (Session 3 · Statement marks): a ✓/✕ per statement, sure/unsure lock-in,
  feedback after each question or at the end in exam mode, keyboard shortcuts, and a summary.
- The eight grade buttons, FSRS scheduling with `ts-fsrs`, and the day's attempts saved to
  `attempts/{day}`.
- The Mistake notebook (Notebook 2 · Two panes, with the revision-book view).
- Content: every register PYQ (2009–2026) whose key is verified, imported by the CLI into
  `items/` — 1,856 of 1,890 on 21 Oct 2026; the other 34 are kept but not served.
- **Done when** a session's answers are saved, due dates follow FSRS, misses appear in the
  notebook, and an unverified key never reaches a session.

### M8 · Mains answer loop

- Write: the phone stepper and the desktop desk, which shows a QR code to send photos from the
  phone. Photos go to Firebase Storage under owner-only rules.
- Marking on Claude's next scheduled run: a transcription for the user to check, the checklist
  out of 10, comments pinned to lines, and "I disagree".
- The marked page (Feedback 1) and the Feedback tab (table + pattern drawer).
- **Done when** a photographed answer is marked by the next run, and its feedback, tags and
  history show.

### M9 · Nightly engine

- The scheduled run writes tonight's lesson (Lesson 3 · Stack, in the night look) and tomorrow
  morning's quiz from the day's misses, and the weekly note.
- **Done when** a day's misses produce a fact-checked lesson by evening and a quiz the next
  morning.

### M10 · More practice

- Flashcards (Flashcards 1 · Classic stack, typed answer, FSRS), puzzles (Puzzles 1 · Arena) with
  the 0–1000 rating, and Rush.
- MCQs and flashcards that Claude writes per microtheme, fact-checked blind before import.
- **Done when** all three item types run on the same attempt log.

### M11 · Homes and analytics

- Prelims Home and Mains Home (both Centre stage), the Prelims subject page (table + analytics
  drawer), and both analytics screens (the week's story).
- **Done when** every number on them comes from the attempt log or the notes.
- **Prelims half done** (branch `claude/m11-prelims-homes`): readiness and the other numbers in
  `src/lib/readiness.ts`; Prelims Home (Board 1 · Centre stage), the subject page with its drawer
  (Subject 2), Prelims Analytics (Analytics 3), "Log reading" with its own small store, and the
  Analytics entry in the Prelims sidebar. Lessons, the morning quiz and the weekly note are read
  when M9 provides them; flashcards and puzzles are counted when M10's items exist.
- **Left for after M8:** Mains Home (Mains 1 · Centre stage) at `/` and Mains Analytics at
  `/mains/analytics`.

### M12 · The rest of Mains

- Essay, Ethics case studies and Medical Science (table + drawer each), and the Board versions
  of the Mains Notes table and the Claude inbox.
- **Done when** each screen works at all three sizes in light and dark.

### Routes and data for M8–M12

Fixed up front (2026-10-21) so the milestones can be built side by side and merged without
guessing. Each milestone adds its routes and sidebar entries in `src/modes/registry.tsx`, its
screens in its own folder with its own stylesheet, and its end-to-end tests in its own
`e2e/<milestone>.spec.ts`.

| Milestone | Routes | Data (Firestore · dev files) | Code |
|---|---|---|---|
| M8 | `/mains/write`, `/mains/answers/:id`, `/mains/feedback` | `mainsq/{paper}` · `mains/questions/<paper>.json` (questions, CLI-imported); `answers/{id}` · `mains/answers/<id>.json`; photos in Storage `answers/{id}/page-{n}.jpg` · `mains/photos/<id>/` | `src/lib/mains.ts`, `src/mains/` |
| M9 | `/prelims/lesson`, `/prelims/quiz` (and the Mains lesson inside `/mains/answers/:id`) | `lessons/{day}` · `practice/lessons/<day>.json`; weekly note `notes-week/{week}` · `practice/weeks/<week>.json` | `src/lib/lessons.ts`, `src/lessons/`, `docs/routines/` |
| M10 | `/prelims/cards`, `/prelims/puzzles`, `/prelims/rush` | Flashcards and puzzles are items in `items/{bank}`; answers in `attempts/{day}` | `src/lib/puzzles.ts`, `src/practice/` |
| M11 | `/` (Mains Home), `/prelims` (Prelims Home), `/prelims/subject/:subject`, `/prelims/analytics`, `/mains/analytics` | Reads the above | `src/homes/`, `src/analytics/` |
| M12 | `/mains/notes`, `/mains/essay`, `/mains/ethics`, `/mains/medical`, and `/inbox` in the Board look | `essay/{id}`, `ethics/{id}`, `medical/{line}` · `mains/essay/`, `mains/ethics/`, `mains/medical/` | `src/mains-extra/` |

## Testing on every milestone

- Unit tests for the Markdown extensions and data helpers.
- Playwright smoke tests at desktop, iPad and Android sizes: navigation, back, hover and
  tap cards, comment, approve.
- Screenshots in each PR; light and dark.
