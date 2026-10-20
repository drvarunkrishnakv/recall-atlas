# Architecture: Mains Atlas reader

A private, minimal, Notion-like app for living UPSC Mains revision notes. You read
and edit notes in it on a Mac, an Android phone and an iPad. Claude keeps the notes
current from official sources and acts on your comments twice a day.

From M6 it is also a practice app with two modes, Prelims and Mains (see "Practice" below).
The sidebar, the top bar and the mode switch use the Board look; note pages keep the
colourful reading style described next.

The visual direction is the **colourful mock** (Evernote-inspired: warm paper ground, a colour
per subject, rounded green action buttons, lavender for Claude): https://claude.ai/artifact/V5VbeLQ3hFE9LAgjf8k5Pe
It replaced Mock A · Paper on 2026-10-16.

## What it does (and nothing more)

- **Navigate:** a short sidebar (Search, Capture, Home, Claude inbox, Revise today, Concept
  cards, News heat map, subjects), breadcrumbs, and working back/forward. Everything is one click.
- **Home (Mains Home from M11):** today's answer, notes due, the last feedback, a "From Claude"
  strip, the six paper tiles, the latest changes in your notes, Continue reading and the scratch pad.
- **Subject database:** every planned note grouped by syllabus topic, with PYQs, status,
  revision (dots + next due), confidence, Claude (questions waiting / replies) and comments;
  Table, Board (by status) and Due views; filters; "Start this note" for planned notes.
- **Revision:** opening a note marks it read; "Mark revised" spaces the next revision at
  1 day after first reading, then 3, 7, 21 and 60 days (halved when weak, ×1.5 when strong).
  No streaks or points.
- **Quick capture:** the green button saves a thought (in your own words) to the scratch pad;
  Claude files it into the right note on its next run and reports in the inbox.
- **Read and edit:** a Notion-style block editor (BlockNote) with headings, lists, tables,
  callouts (incl. the Prelims box), charts and flowcharts. "/" inserts blocks; "@" links a
  concept card or note (or creates a card). A Reading/Editing switch per device; autosave.
- **Side peek:** clicking a card or note link opens it in a panel on the right (full screen
  on phones), editable in place. The URL holds it (`?peek=card:id`), so back closes it.
  Desktop hover still previews a card's summary.
- **Comment:** select text → Comment, Sticky note or Ask Claude. Threads sit in the right
  margin beside their text on wide screens, and in a panel or bottom sheet elsewhere.
  ✓ resolves a comment; sticky notes never resolve; Claude replies to Ask Claude threads.
- **Find:** ⌘K search over titles, headings and text; the open note's sections show under
  it in the sidebar; "Cited in" / "Linked from" backlinks at the foot of each page.
- **Approve (M4):** Claude's proposed updates appear inline with ✓ Approve / ✗ Reject.
- **News heat map:** "News heat map" in the sidebar (`/heat-map`): every news story from
  January 2024 on, scored per month for coverage and exam weight (0–4). A chart of months hot
  against peak loudness (long and loud, loud but brief, slow burners, background), the chosen
  story's month-by-month timeline with sources, and every story's "river". Built from the news
  only, without past papers, so it can later be compared with what UPSC asked. Read-only in the
  app; Claude imports it.

Non-goals: multiple users, live co-editing, an AI chat box, public sharing,
gamification (the practice rating the user asked for is the one exception), or any Notion
feature we don't use.

## Practice (M6 on)

- **Two modes.** Prelims lives under `/prelims` with its own sidebar; every other route is Mains.
  A big PRELIMS / MAINS switch sits in the top bar, green for Prelims and amber for Mains, and
  remembers each mode's last page on the device.
- **One attempt log.** Every answer (MCQ, flashcard, puzzle) is added once to `attempts/{day}`.
  Only its miss reason can change later. Shapes and checks: `app/src/lib/practice.ts`.
- **The engine has three layers**, all reading that log:
  1. On the device, with no AI: FSRS scheduling for MCQs and flashcards (`ts-fsrs`, from M7), the
     puzzle rating, readiness and the daily target.
  2. Claude's scheduled runs: marking Mains answers, tonight's lesson and the morning quiz,
     generated questions with a blind fact-check, and the weekly note. Results reach the Claude
     inbox.
  3. A monthly tuning pass that fits FSRS to your own log and records changes in DECISIONS.
- **Items** come in banks (one per Prelims chapter topic). A PYQ is served only when its key
  has been checked (`keyVerified`). `keyFrom` says against what: UPSC's final or provisional key
  (2012–2026), or for 2009–2011, which have no official key, the register, Grok and Gemini
  agreeing. The session shows that line under each answer.
- **Where it lives (M7).** Files: `content/practice/banks/<bank>.json` and
  `content/practice/attempts/<day>.json`. Firestore: `items/{bank}` and `attempts/{day}`. Both
  answer `GET /api/practice` (`{banks, days}`) and `POST /api/practice/attempts/<day>` (an
  `AttemptOp`: add, or change a grade). The CLI loads banks with `atlas practice-import`, which
  checks every bank first. Review state isn't stored: `src/lib/srs.ts` rebuilds each item's FSRS
  card by replaying its attempts (no fuzz, retention 0.9), so the log is the only record.
- **Screens plug in through `src/modes/registry.tsx`**: each milestone adds its routes and
  sidebar entries there.
- **The nightly engine (M9).** Claude's evening run reads the day's misses (`atlas misses`),
  writes one lesson card per concept with a blind fact-check, picks 5–10 quiz items and stores
  the lesson (`atlas lesson-write`), as `docs/routines/nightly-lesson.md` says. A weekly run
  writes the weekly note from `atlas week-data` (`docs/routines/weekly-note.md`). Shapes and
  checks: `app/src/lib/lessons.ts`.
  - Files: `content/practice/lessons/<YYYY-MM-DD>.json` and `content/practice/weeks/<YYYY-Www>.json`.
    Firestore: `lessons/{day}` (the app reads it and adds ratings; only the CLI creates one) and
    `notes-week/{week}` (read-only to the app).
  - Routes: `GET /api/lessons` (`{days, latest}`: each day's cards and ratings, and the latest
    lesson in full), `GET /api/lessons/<day>`, `POST /api/lessons/<day>` (a `LessonOp`: rate a
    card "got" or "shaky", or take a press back), `GET /api/weeks[/<week>]`.
  - Screens (`src/lessons/`): `/prelims/lesson?day=&card=` (Lesson 3 · Stack, in a night variant of
    the Board tokens scoped to the lesson) and `/prelims/quiz?day=` (the M7 session's `Run` with
    mode "quiz"). The Mistake notebook links a question to the newest card that teaches it.
  - A card rated shaky comes back in the next lessons until it is rated "got" on two different
    later days (`shakyQueue`); `lesson-write` adds the due ones itself.

- **Flashcards, puzzles and Rush (M10).** Screens in `src/practice/` (`/prelims/cards`,
  `/prelims/puzzles`, `/prelims/rush`). They are items in the same banks and answers in the same
  log, so nothing new is stored:
  - A flashcard is `qa`, `cloze` (`___` marks the blank), `list` (`list` holds the items) or
    `image` (`image` + `alt`; `svg:<id>` is a small map the app draws). FSRS plans the deck
    (`planSession(…, "flashcard")`, due first). Each card is one attempt with `typed` and a grade:
    Forgot → `forgot`, Hard → `hard`, Knew it → `good`, Easy → `easy`. `lib/flashcards.ts`
    compares the typed answer with the card to suggest a grade.
  - A puzzle has a `style`: `tf` (`statement`, `truth`), `match` (`pairs`), `order` (`order`, the
    right order) or `map` (`map`, `alt`, `regions` in % of the picture, the right `region`). A puzzle
    without a style is the older pick-one shape (`options`, `answer`). Puzzles stay out of FSRS.
    Each answer moves the one 0–1000 rating by Elo (K 32, `lib/puzzles.ts`); the next puzzle is
    drawn near your rating from the chosen subjects, avoiding the last 40 you met.
  - Rush answers are attempts with mode `rush`, no `delta`, and a `session` id per run; the best
    score is the most right answers in any run, read from the log.
  - True-or-false banks (`<subject>-tf`, topic "True or false") are derived from verified PYQ
    statements by a private script (`data/practice_build/derive_puzzles.py`) and loaded with
    `atlas practice-import` (without `--replace`).

- **Homes and analytics (M11).** `src/lib/readiness.ts` works out readiness (five parts, DECISIONS
  2026-10-21), "where the marks are", calibration and the guessing rule, the daily target, weak
  spots and each topic's drawer, replaying FSRS once over the log for weekly trends. Screens:
  `src/homes/` (Prelims Home at `/prelims`, the subject page at `/prelims/subject/:subject`, where
  `:subject` is the bank's subject in lower case with other characters as hyphens; the drawer is
  `?open=<bank>&kind=mcq|flashcard`) and `src/analytics/` (`/prelims/analytics`, `?range=4w|all`,
  small inline-SVG charts). Book order is a bank's optional `order`, else the order banks load in.
- **Reading log (M11).** "Log reading" adds today to a topic: Firestore `reading/{subject}` (owner
  read, create, update) and dev files `practice/reading/<subject>.json`, both as
  `{topics: {[bank]: ["YYYY-MM-DD"]}}` through `GET /api/reading` and `POST /api/reading/<subject>`
  (`{op: "log" | "unlog", bank, day}`, `src/lib/reading.ts`).
- **Engine notes are optional reads.** The homes fetch `GET /api/lessons` (and `GET /api/weeks`
  when the lessons don't carry `weeks`) and treat a 404 or any failure as "nothing yet", so the
  screens work before the nightly engine (M9) exists and light up once it does. Lessons are read
  as `{lessons|days: {day: {cards|concepts, quiz}}}` or a list; the weekly note as
  `{weeks: {week: {lines: [text | {text, evidence}]}}}`, where `evidence` names an Analytics section
  (`readiness`, `misses`, `speed`, `calibration`, `marks`, `effort`, `mocks`) or a subject.

- **Mains answers (M8).** `/mains/write` picks a question (retries due first, then new ones), runs
  the optional 1-minute plan and the countdown (7 min for 10 marks, 11 for 15) in a dimmed
  full-screen "exam hall", then takes 1–3 page photos, a self-score and sends the answer. Phones get
  the stepper, wider screens the desk, which shows a QR code to `/mains/write?answer=<id>` so the
  phone adds photos to the same answer. `/mains/answers/:id` is the marked page (or "waiting for
  marking"); `/mains/feedback` is the table of answers with the fix-tag pattern drawer. Shapes,
  checks and the Feedback numbers are in `app/src/lib/mains.ts`; screens in `app/src/mains/`.
- **Where it lives (M8).** Files: `content/mains/questions/<paper>.json`,
  `content/mains/answers/<id>.json` and `content/mains/photos/<id>/page-<n>.<ext>`. Firestore:
  `mainsq/{paper}` (read-only to the app) and `answers/{id}` (owner create and update, no delete);
  photos in Firebase Storage at `answers/{id}/page-{n}.<ext>` (`storage.rules`). Both answer
  `GET /api/mains` (`{sets, answers}`) and `GET|POST /api/mains/answers/<id>` (one of the app's
  `AnswerOp`s; marking, resolving and rewrite marks are CLI-only). Photos go to
  `POST /api/mains/photos/<id>/<file>` on the dev server, or straight to Storage in the cloud build.
  The CLI (`cli/mains.ts`, dispatched from `atlas.ts`) loads questions, lists answers waiting with
  each photo as a file path (downloaded from Storage first on Firestore), saves a checked marking,
  marks rewrites and resolves disputes. The scheduled run's prompt: `docs/routines/mark-answers.md`.
- **Mains Home and Mains Analytics (M11).** `src/lib/mains-analytics.ts` works out, on the device and
  from the stores the app already loads (Mains answers, notes, progress, proposals, threads,
  captures, the weekly note), each paper's average and marks still open (paper marks × (1 − average
  ÷ 10), unstarted papers in full; Medical Science is its two papers as one 500-mark tile), scores
  and answers by week, marks kept per checklist item, self-score gap and time per 10-marker by
  month, full papers (250 marks of questions in one sitting) and the predicted-score gate, the
  adaptive daily answer target (DECISIONS 2026-10-21), the latest changes in your notes (approved
  proposals and edits) and the From Claude items. Nothing new is stored.
  - Mains Home at `/` (`src/homes/MainsHome.tsx`): "Today's answer" links to
    `/mains/write?q=<id>`, the first of M8's `suggestQuestions` (the Write screen's own first pick);
    paper tiles lead to `/mains/notes?paper=gs1…gs4`, `/mains/essay` and `/mains/medical` (M12), and
    a tile's subject link to the subject table (`/gs2/polity`).
  - Mains Analytics at `/mains/analytics` (`src/analytics/MainsAnalytics.tsx`, `?range=4w|all`,
    8 weeks by default). Sections have anchors `#scores`, `#checklist`, `#self-score`, `#time`,
    `#volume`, `#open`. The weekly note's lines whose evidence route doesn't start with `/prelims`
    are pinned on top; Prelims Analytics shows only the others.
  - `atlas week-data` gives each week a `mains` block (`mainsWeekFacts`): answers sent and marked,
    the average, the self-score gap, the 10-marker time, answers that ran over, the costliest
    checklist item, the target, marks still open and the evidence routes above.

### Mains extras (M12): Essay, Ethics case studies, Medical Science, Notes, inbox

- **Routes:** `/mains/notes`, `/mains/essay` (with `/mains/essay/sprint/:id`, `/mains/essay/write/:id`,
  `/mains/essay/paper`), `/mains/ethics` (and `/mains/ethics/bench/:id`), `/mains/medical` (and
  `/mains/medical/draw/:line/:diagram`), and `/inbox` in the Board look. Code in
  `src/mains-extra/`, styles in its own `mains-extra.css`. Every list is a table plus a drawer; the
  open drawer is in the URL (`?topic=`, `?case=`, `?line=`, `?note=`, `?item=`), so back closes it.
  Beside the table from 1280 px, a full-height sheet below that, a page of its own on phones.
- **Data** (`src/lib/mains-extra.ts`, pure and tested): content written only by the CLI, and your
  records written by the app one op at a time (`WorkOp`: `try`, `outline`, `sitting`, `attempt`,
  `rate`, `drill`). Files: `content/mains/<essay|ethics|medical>/<id>.json` and `mine-<id>.json`.
  Firestore: `essay/{id}`, `ethics/{id}`, `medical/{line}` and their `mine-{id}` siblings; the rules
  let the app create and update only `mine-` documents and delete nothing. Both answer
  `GET /api/mains-extra` and `POST /api/mains-extra/<kind>/<id>` (server/mains-extra-files.ts,
  src/content/mains-extra-cloud.ts; the CLI's Firestore side is server/mains-extra-firestore.ts).
- **The Write flow's data (M8)** is read loosely for counts and averages: `mains/answers/*.json`
  (`answers/{id}`) and `mains/questions/*.json` (`mainsq/{paper}`), through `answerSummaries` and
  `questionSummaries`. Writing an answer is M8's: the screens link to `/mains/write?essay=<id>`,
  `?ethics=<id>` or `?medical=<line>`.
- **CLI** (`cli/mains-extra.ts`): `mains-extra` (what's loaded and done), `mains-extra-import
  <file> [--replace]` (checks every record; a law a case cites needs an official source; a checked
  note needs one too), `mains-extra-work [kind]` (your records, for Claude's runs).
- **Inbox actions** are proposal ops (`src/lib/proposals.ts`): `verify` (Verify, then add, when the
  source isn't primary yet), `revise` (Edit), `unverified` (Add it now, marked unverified), plus the
  existing `approve` and `reject`. `atlas proposals` shows the ones waiting for a source check.

## Stack

| Part | Choice | Why |
|---|---|---|
| App | Vite + React + TypeScript | Small, fast, familiar |
| Routing | React Router, history mode | Real URLs; back/forward work; Hosting rewrites to `index.html` |
| Editor | **BlockNote** (MPL-2.0 core, on Tiptap/ProseMirror) with the Mantine UI | Most Notion-like out of the box (blocks, drag handles, slash menu, formatting toolbar); comments extension with a pluggable thread store; custom blocks in React |
| Read view | The same editor, not editable | One renderer for reading and editing |
| Charts | Small SVG renderer from JSON rows (as in the mock) | No heavy charting library |
| Diagrams | Mermaid, lazy-loaded | Flowcharts as text that Claude can write and diff |
| Hosting | Firebase Hosting | You already use Firebase |
| Sign-in | Firebase Auth, Google | Only your account can open the app |
| Data | Cloud Firestore with offline persistence | Works on all devices; readable offline |
| Instant start | The last-loaded notes kept in IndexedDB (`content/snapshot.ts`) | Opens in about a second while sign-in finishes; wiped on sign-out |
| Install | PWA (manifest + service worker) | Home-screen app on Android and iPad |

## Content format

Each page (note or card) is **BlockNote block JSON**, the source of truth:
`content/<notes|cards>/<id>.json` = `{id, title, version, updated, …meta, blocks}`.
Atlas adds five schema items: `chart` (JSON spec, drawn as SVG), `flowchart` (Mermaid),
`callout` (note / prelims / warning), the inline `term` chip (`{kind: card|note, id, label}`)
and the inline `cite` marker (`{label, url}`): a small numbered source marker after the
sentence, with a Sources list at the foot of the page (docs/STYLE_GUIDE.md).

Every save also writes `<id>.md`, a **Markdown copy** in the Atlas dialect (`[[card-id|label]]`,
```` ```chart ````, ```` ```mermaid ````, `> [!PRELIMS]`), for git diffs, other agents and as
a backup. The app never reads it back; Markdown-only pages are converted to blocks once,
keeping the original in `content/history/`.

Study state lives beside the notes so it follows you and Claude can read it:
`content/progress.json` (per note: `readAt`, `revisions[]`, `confidence`) and
`content/captures.json` (scratch-pad captures and Claude's filing notes). "Continue
reading" is per device (localStorage).

Comment threads live beside the page in `content/comments/<collection>-<id>.json`. Each
thread has a kind (comment / sticky / claude) and an anchor (block id + the exact quoted
text). BlockNote doesn't save comment marks in block JSON, so the app re-finds each quote on
load and re-adds the highlight; a thread whose text is deleted becomes "detached".

## Data model (Firestore)

Each document keeps its data as one JSON string, `json` (BlockNote's nested table cells and
undefined fields aren't valid Firestore values). Shapes are in `app/src/lib/cloud-docs.ts`.

| Document | Fields |
|---|---|
| `notes/{noteId}`, `cards/{cardId}` | `title, version, updated, snapshotAt` and `json` = the page (meta + `blocks`, or `markdown` until first opened) |
| `notes/{noteId}/history/{ms}-v{n}` | The previous version (or `-original` Markdown), at most every 10 minutes of editing |
| `comments/{collection}-{id}` | `json` = `{threads}` for that page |
| `discussions/{collection}-{id}` | `json` = `{discussions}` for that page |
| `study/progress`, `study/captures` | `json` = revision progress, and quick captures |
| `heatmap/questions[, questions-1…]` | `json` = the comparison with past papers (`Comparison` in `app/src/lib/heatmap.ts`): each question matched to a story, and the findings. Read-only to the app; written by `atlas heatmap-compare-import` |
| `heatmap/current[, current-1…]` | `json` = the news heat map (`app/src/lib/heatmap.ts`), split across parts of at most 300 000 characters; `current` carries `parts`. Read-only to the app; written by `atlas heatmap-import` |
| `items/{bank}` | `json` = `{items}`: MCQs, flashcards and puzzles for one bank (`Item` in `app/src/lib/practice.ts`). Written by the CLI; the app only reads |
| `attempts/{YYYY-MM-DD}` | `json` = `{attempts}`: that day's answers, in order (`Attempt`) |
| `srs/{bank}` | `json` = `{cards}`: each item's review state in that bank (from M7) |
| `mainsq/{paper}` | `json` = `{paper, questions}`: one paper's Mains questions (`MainsQuestion` in `app/src/lib/mains.ts`). Written by the CLI; the app only reads |
| `answers/{id}` | `json` = one Mains answer (`MainsAnswer`): question, times, pages, self-score, transcript, marking, disputes, rewrites. Photos are in Storage at `answers/{id}/page-{n}.<ext>` |

| `essay/{id}`, `ethics/{id}`, `medical/{line}` | `json` = an essay topic with Claude's breakdown, a practice case with its key, or a Medical Science syllabus line with its PYQs, diagrams and Claude's note (`app/src/lib/mains-extra.ts`). Written by `atlas mains-extra-import`; the app only reads (M12) |
| `essay/mine-{id}`, `ethics/mine-{id}`, `medical/mine-{line}` | `json` = your own record: decoding, outlines and timed sittings; bench attempts; rating and diagram drills. The app creates and updates, never deletes (M12) |
| `proposals/{collection}-{id}` | `json` = `{proposals}`: kind (edit / add / row / check), blockId, find/replace, text or cells, source, reason, origin (flag / feed / claude), status (pending / applied / rejected / stale) |

- The syllabus tree (papers, subjects, topics, planned notes) is not private, so it
  ships in the app as JSON.
- "Cited in" lists on cards are derived by scanning note bodies for `[[card-id|…]]`,
  never stored by hand.

## Privacy and security

- This repository is public. It holds **no note content**, no credentials and no source text.
- Firestore rules (`firestore.rules`) allow reads and writes only to an account carrying the
  `atlasOwner` custom claim, which only the Admin SDK can set (`atlas owner <uid|email>`).
  A signed-out visitor sees only the sign-in button. The web config in `app/.env.local`
  identifies the project; it is not a secret.
- Locally (`npm run dev:fixture`, `dev:notes`, the tests) the Vite dev server's save API
  writes the files above. Writes are accepted only from this Mac (loopback), only from the
  app's origin, and only with the `X-Atlas` header; page ids are validated to block path tricks.
- Claude works through `app/cli/atlas.ts` (list comments, reply, show a page, replace one
  exact phrase). It runs on Firestore through the Firebase Admin SDK, with its
  service-account key outside the repo (`~/.config/mains-atlas/service-account.json`), or on
  a content folder when `ATLAS_CONTENT_DIR` is set.
- Other AIs (Grok, Gemini, ChatGPT, any MCP client) join through the Atlas MCP server
  (`app/mcp/`), hosted as a Cloud Function at `https://<project>.web.app/mcp`. Its only writes
  are a bot's own turn (when it's that persona's turn, with a source) and flags on exact quotes
  (capped per note). It never edits notes or comments. Each AI has its own key (a SHA-256 hash
  in Firestore `mcpKeys/`, closed to the app), which also names the AI on what it posts;
  browser requests are refused. Apps that sign in by OAuth (the Gemini app, Claude.ai) get
  tokens instead, after the owner approves them on the app's `/oauth/authorize` page
  (`server/oauth.ts`). On the Mac it can also run locally (`npm run mcp:http`).
  Bots' text is shown as plain text and treated as material, never as instructions to Claude.
- The private notes repo (`drvarunkrishnakv/upsc-mains-atlas-notes`) keeps a Markdown
  mirror exported from Firestore, so other agents can read it and git keeps the history.

## How Claude keeps notes current

A scheduled Claude task runs twice a day (morning and evening):

1. Fetch official sources (PIB, PRS, Supreme Court) and match them to note watch profiles.
2. Write real changes as `proposals` (State of play rewrites, new evidence, open checks).
3. Read open comments addressed to Claude, act on them, and reply in the thread. Take any
   discussion turn that is Claude's (`atlas turns`) that a live run missed.
4. Apply approved proposals, bump versions, and save history.
5. Export the mirror to the private notes repo and push.

Claude never changes a fact without either your approval or your explicit comment asking for it.

## Repository layout (target)

```
app/                 Vite React app (editor, side peek, comments, search)
app/src/editor/      BlockNote schema, page view, one-time Markdown conversion
app/src/comments/    Thread store, anchors, comments UI
app/src/lib/         Pure helpers shared with the server and CLI (Markdown export, threads)
app/server/          Local save API (Vite dev middleware); the CLI/MCP backends (files, Firestore)
app/cli/atlas.ts     Node CLI for Claude: comments, replies, page text, exact edits, captures, progress
app/src/dashboard.tsx Home, subject database, Revise today, Claude inbox
app/src/content/     Syllabus tree (public structure only), the content store, Firebase and the cloud API
firebase.json        Hosting (with the /mcp rewrite), the MCP function, Firestore rules, emulators
functions/           The hosted MCP server, bundled from app/mcp/function.ts (npm run mcp:function)
firestore.rules      Owner-only rules (tested in the emulator: npm run test:cloud)
storage.rules        Owner-only rules for Mains answer photos in Firebase Storage (same tests)
docs/                Architecture, build plan, decisions, handoff
```
