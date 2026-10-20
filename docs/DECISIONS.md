# Decisions

## 2026-10-21 — Mains Home and Mains Analytics (M11, Mains half)

- **The daily answer target rises with the calendar.** Agreed on 2026-10-20 as "1–2 now, 5–6 in
  the Mains season"; `answerTarget` in `app/src/lib/mains-analytics.ts` makes it exact:
  - until Prelims (23 May 2027): 1–2 answers a day, 7–14 a week. Prelims comes first; a daily
    answer or two keeps the habit and gives the marking something to learn from;
  - after Prelims it rises by one answer a day each week: 2–3, 3–4, 4–5, then 5–6 from the fourth
    week (14 June 2027). A step a week, so the habit grows instead of breaking on a sudden jump;
  - 5–6 a day holds until Mains (20 Aug 2027): roughly a 250-mark paper's worth of questions every
    three to four days, about 1½ hours of writing a day at 7–11 minutes an answer;
  - from the first day of Mains there is no target.
  It doesn't yet adapt to what you actually write; Analytics compares the two week by week.
- **A full paper is 250 marks of questions in one sitting.** Answers on one paper, sent on one day,
  whose questions carry 250 marks between them (a GS paper's twenty questions, or the Essay's two).
  No predicted score until two such papers are marked (the Mains version of Prelims' "three
  mocks"); after that, a rough total out of 1,750: the share scored on those papers applied to every
  written paper, labelled a rough guide.
- **Marks still open** per paper = paper marks × (1 − average score ÷ 10). A paper with no marked
  answer counts in full, so Medical Science (both optional papers, 500 marks) leads until it starts.
- **The weekly note is shared by both modes, split by its evidence.** A line whose evidence route
  starts with `/prelims` shows on Prelims Analytics; any other (`/mains/…`, `/notes/…`) on Mains
  Analytics. Until Claude's weekly run writes Mains lines, Mains Analytics pins the story worked out
  on the device and says so. `atlas week-data` now gives each week's Mains facts and their routes.
- **The Mains Home replaced the old home at "/".** What moved: "notes to revise" and "Due for
  revision" became the Notes due card; the "from Claude" count and the Claude inbox panel became
  the From Claude strip; the subject cards became the paper tiles, whose subject links (Polity) still
  open the subject table. Continue reading and the scratch pad stay, below the papers. The old
  `HomePage` is left in `dashboard.tsx`, unused, until M12 has merged.

## 2026-10-21 — The nightly engine (M9)

- **The lesson keeps its night look in light mode too.** The user chose a warm, dim night version
  of Board for the lesson (Chang et al. 2015) because it is read before sleep. A bright version
  would undo that, so the lesson is a dark warm panel inside the shell in both themes. The
  sidebar, the top bar and every other screen follow the theme as before.
- **Shaky concepts come back until they hold.** A card called "Still shaky" is added to every
  later lesson until it is called "Got it" on two different days after the last "shaky" (the
  day of that "shaky" doesn't count). The same successive-relearning rule the Mistake notebook
  uses for "fixed". `lesson-write` adds the due cards itself, so a run can't forget them.
- **Ratings live in the lesson.** `lessons/{day}` holds the cards, the quiz and the user's
  presses. The CLI writes a lesson and keeps the presses already made; the app may only add or
  take back a press (Firestore: read and update, never create or delete). Weekly notes in
  `notes-week/{week}` are written by the CLI only.
- **The morning quiz is the practice session in short form**, on the lesson's quiz items, with
  answers saved in the attempt log as mode "quiz". FSRS and the notebook count them like any
  other answer.

## 2026-10-21 — Flashcards, puzzles and Rush on the one log (M10)

- **One rating.** Puzzles move the same 0–1000 rating as MCQs: each answer's `delta` is Elo with
  K = 32 against the puzzle's difficulty, as agreed, and `ratingAfter` adds every delta up. Rush
  never moves it (mode `rush`, no `delta`; the check refuses one).
- **Rush keeps its best in the log, not on the device.** Each run's answers share a `session` id,
  so the best score (most right answers in a run) follows the user to every device.
- **Puzzle shape.** `PuzzleItem` gained an optional `style` (`tf`, `match`, `order`, `map`) with
  each style's own fields; `options` and `answer` became optional and are required only when there
  is no style, so items in the older shape still load.
- **True-or-false puzzles come from verified PYQs, conservatively.** One per statement, only when
  the answer key says for certain whether that statement is true (the app's own option logic,
  ported and checked against it on 21,912 cases), the question asks which statements are correct,
  and the statement reads on its own. Pairs, "not correct" questions, count answers, the
  "explains" part of Statement-I/II questions and property lists ("Which of the above…") are left
  out. Every puzzle starts at difficulty 500: there's no principled way yet to rate a single
  statement, and the rating places them as they are answered.
- **No real flashcards yet.** Cards Claude writes need the blind fact-check pipeline first, so the
  card screen runs on the fixture until then.

## 2026-10-21 — Readiness: five parts, coverage multiplies (M11)

- **What it measures.** Readiness (0–1000) for a subject, a topic or a microtheme is how much of
  its Prelims questions you're ready for, worked out on the device from the attempt log and the
  banks (`app/src/lib/readiness.ts`). Nothing is stored.
- **The five parts** (the chosen Analytics design):
  - coverage: the share of servable MCQs and flashcards answered at least once;
  - memory: FSRS retrievability now, averaged over the items answered;
  - new questions: the share of MCQs right the first time you met them;
  - speed: the share of the last four weeks' MCQ answers given within 72 s (100 questions in
    120 minutes);
  - calibration: the share of the last four weeks' "sure" answers that were right.
- **How they combine:** readiness = 1000 × coverage × (0.35 memory + 0.35 new questions +
  0.15 speed + 0.15 calibration). Coverage multiplies because you can't be ready on questions you
  haven't met; added like the others, three perfect answers would make a 200-question subject look
  half ready. Memory and new questions share 70%: one says what you learnt stays, the other that it
  transfers to unseen questions, which is what the paper asks. Speed and calibration get 15% each:
  they decide whether knowledge becomes marks (finishing in time; not losing ⅔ of a mark on a
  confident miss). A part with no evidence yet is left out and the others share its weight.
- **Prelims readiness** weighs each subject by its share of the banks' Prelims PYQs, so it reads
  as the share of a paper you're ready for, and "where the marks are" (share × (1 − readiness ÷
  1000) × 100) adds up to the rest of the paper.
- **The four-week window** for speed and calibration is the shortest range Analytics offers, so a
  habit you've dropped stops counting within a month. First tries are kept for good: each item has
  only one.
- **Weak spots** are judged on each item's latest answer (at least three answers in the microtheme
  and at least one latest miss), so a miss you've since fixed stops counting.
- **The daily target** spreads every unseen servable item plus the reviews due now over the days
  left to 23 May 2027, recomputed each day; there is no streak counter.
- **To revisit** in the monthly tuning pass, once a month of real answers exists: the weights, and
  whether FSRS's retrievability right after a lapse (it is still about 0.7–0.8 two days later)
  flatters memory on topics you keep missing.

## 2026-10-21 — Mains answers: photos, marking and disputes (M8)

- **Photos live in Firebase Storage** at `answers/{id}/page-{n}.jpg`, under owner-only rules
  (`storage.rules`: the `atlasOwner` claim, JPEG/PNG/WebP only, under 8 MB, no deletes). Locally
  the dev API keeps them in `content/mains/photos/<id>/`. The app shrinks a photo to 2,000 px on
  its long side (JPEG) before sending it, so an upload is well under a megabyte. The app shows a
  Storage photo through its download URL, which is fetched only by the signed-in owner.
- **An answer is created when the timer starts**, as a draft, so the desk can show a QR code to
  `/mains/write?answer=<id>` and the phone can add pages to the same answer. Its status then runs
  draft → waiting (sent) → marked, or disputed while an "I disagree" is open. Answers are never
  deleted, like the attempt log.
- **The reading check moved to the marked page.** The Write mocks showed the transcript before the
  self-score, but marking (and so transcribing) happens on the next run. The user checks Claude's
  reading on the answer's page instead; a correction after marking opens a dispute so the next run
  checks whether a misread word cost marks.
- **"Straighten" is a quarter turn for now.** A page can be turned on the device that took it (it
  keeps the original until the page is reloaded), then sent again under the same name. Automatic
  deskewing and cropping can come later.
- **Disputes** are one per checklist item. The next run resolves each as changed (the item's marks
  and the score move) or kept, always with a reason; the app shows both and counts them.
- **The QR code is made on the device** with `qrcode-generator` (no dependencies, no network).
- **Real questions:** the register's 974 Mains PYQs (GS1–GS4, 2013–2025). The register gives a word
  limit for 86 of them in the question's own note (37 with the marks too; for the other 49 the marks
  follow the usual split, 150 words = 10 marks and 250 = 15). The other 888 are set as 10-markers of
  150 words and flagged, so the Write screen offers a 10/15 switch. "It asks for" is built from
  the question's sentences and directive words by the private build script.

## 2026-10-20 — Prelims and Mains practice inside the app

- **What the user asked for:** one study system for CSE 2027 inside Mains Atlas, with a Prelims
  mode and a Mains mode. Prelims is MCQ-first practice with miss reasons, FSRS for MCQs and
  flashcards, puzzles with a 0–1000 rating, and nightly lessons from the day's misses. Mains is
  answers written on paper, photographed and marked by Claude, plus Essay, Ethics case studies and
  the Medical Science optional. The user chose every screen from three mocks on the design canvas
  (https://claude.ai/artifact/5L9F2MBYd2QSETo5r485cQ).
- **The rating is the one exception to "no gamification".** The user asked for a chess.com-style
  rating with ± points on puzzles. There are still no streaks, badges or points anywhere else.
- **Board shell everywhere.** The sidebar, the top bar and the Prelims/Mains switch use the Board
  look: warm graphite in dark, warm paper in light, Nunito, green for Prelims and amber for Mains.
  Note and card pages keep their reading style inside it. Board has a light mode as well as a
  dark one, because every screen must work in both.
- **Modes follow the URL.** Prelims lives under `/prelims`, and every existing route is Mains. The
  switch remembers the last page of each mode on the device (`atlas-mode-path-prelims`,
  `atlas-mode-path-mains`).
- **One attempt log feeds the engine.** Every answer is added once to `attempts/{day}` and never
  changed, except its miss reason. Three layers read it. On the device, without AI: FSRS, the
  rating, readiness and the daily target. Claude's scheduled runs: marking, the nightly lesson and
  morning quiz, generated questions with a blind fact-check, and the weekly note. A monthly tuning
  pass fits FSRS to the user's own log.
- **Marking waits for the next scheduled run.** That needs no API key and costs nothing per
  answer. A faster path (a Cloud Function calling the API) can come later.
- **No PYQ reaches a session until its key is checked** against UPSC's official answer key
  (`keyVerified`). The register's answers came from a third-party export.
- **Data shapes** are in `app/src/lib/practice.ts`, pure and tested: items (MCQ, flashcard,
  puzzle), attempts with the eight grades from the chosen session design, and the grade-to-FSRS
  mapping. Wrong answers (Didn't know, Forgot, Mixed up, Misread, Risky guess) are Again; Guessed
  is Hard, Knew it is Good and Instant is Easy. FSRS itself (`ts-fsrs`) arrives with M7.
- **Firestore:** `items/{bank}` holds a bank of items, which the CLI writes and the app only reads.
  `attempts/{YYYY-MM-DD}` holds a day's attempts and `srs/{bank}` a bank's review state. Both are
  owner-only reads and writes.

## 2026-10-19 — App pages are not cached for an hour

- Hosting matches header rules against the requested path, before the rewrite to `/index.html`.
  App routes (`/`, `/notes/P06`, `/gs2/polity`) have no file extension, so the
  `**/*.@(html|webmanifest)` rule missed them and Hosting gave them its default `max-age=3600`.
  A browser, and the service worker's network-first page fetch, could keep the old app for up to
  an hour after a deploy.
- Two header rules now send `Cache-Control: no-cache` to app routes: `{/,/oauth/authorize}` and
  `/!(mcp|oauth|assets|__|*.*){,/**/!(*.*)}` (every path whose last part has no extension, minus
  the prefixes below). `no-cache` makes the browser revalidate with the ETag each time, so an
  unchanged page costs only a 304.
- Left out on purpose: `/mcp` and `/oauth/*` (the MCP function; its OAuth replies set `no-store`,
  which a Hosting header must not replace), `/.well-known/**` (also the function), `/assets/**`
  (hashed files, kept for a year) and `/__/**` (Firebase's own sign-in pages). `/oauth/authorize`
  is the one app page under `/oauth`, so it is named. The simpler `**/!(*.*)` was rejected: it
  misses `/` and catches `/mcp` and `/oauth/token`.
- A new app route needs nothing. A new function rewrite without an extension must be added to the
  excluded prefixes.

## 2026-10-19 — Motion and gestures in the reader

- The user asked for smooth animation after comparing the app with YouLearn: page transitions,
  linked margin notes and highlights, phone gestures, a sticky colour picker, a loading shimmer,
  press feedback and a reading-progress bar. They didn't want the YouLearn-style panel layout.
- **Page transitions** use the browser's View Transitions through React Router (`viewTransition`
  on links, wrapped once in `components/nav.tsx`), not an animation library: no extra code to
  load, and browsers without it simply change page. Only a change of page animates (not a
  filter or a peek); back and forward replay it. A note's title glides between list and heading
  (`view-transition-name: page-title`). Theme switches crossfade the same way.
- **Gestures** are a small hook (`components/gestures.ts`) on pointer and touch events, not a
  library. Sheets close when dragged down by their top band only, so the list inside still
  scrolls. The edge swipe for back is on only in the iPhone/iPad home-screen app, because
  browsers and Android have their own and would go back twice.
- **Paper colour** is stored on the thread (`color`, 0–5, new `color` thread op); without it the
  colour still follows from the id, so older notes keep theirs.
- Every animation stops for `prefers-reduced-motion`.

## 2026-10-19 — Faster start: show the kept copy while sign-in finishes

- Measured on the live site: about 3 s to the first page, of which about 1.3 s is Firebase Auth
  refreshing the token and looking up the account (it must finish before Firestore will read
  anything), and about 1 s is Firestore round trips. Moving between pages was already quick
  (about 0.2 s); a note's diagram took about 2.8 s, mostly Mermaid 12 fetching its 1.4 MB ELK
  layout engine.
- **Instant start:** the cloud build keeps the last pages and study data it loaded in IndexedDB
  (`content/snapshot.ts`) and, for the account that kept them, shows them at once on the next
  launch; fresh data replaces them when Firestore answers, and an open note takes the newer copy
  unless something typed is unsaved. The copy holds nothing the Firestore offline cache doesn't
  already keep on the device. Signing out, a refused account or a different account wipes it.
  Trade-off: if the account's access is withdrawn elsewhere, this device still shows its copy
  for the second or two until Firebase says so.
- The read check and the first loads now run together instead of one after the other.
- **Diagrams:** Mermaid uses the classic dagre layout (no ELK download), and drawn diagrams are
  kept by code and theme (in memory and localStorage, last 40), so a note's diagram shows at once
  the next time.
- **Tried and dropped:** loading the editor as a separate chunk. It cut Home by about 0.1 s but
  made every note open 0.2–0.5 s slower on a slowed phone CPU, and notes are what the app is for.

## 2026-10-18 — Comparing the frozen heat map with the 2025 and 2026 papers

- The map was frozen first (`frozenAt`, notes-repo commit e90b278). The comparison is a separate
  dataset (`content/heatmap-questions.json`, Firestore `heatmap/questions`), so the map never changes.
- Papers: Prelims 2025 and 2026 (GS1), Mains 2025 and 2026 (GS1–GS4 and Essay). The 2024 papers
  are left out: the map holds at most eight months of news before them.
- **Cutoff:** a paper can only draw on news up to the month before its exam (papers are set
  earlier), and each story's corner is worked out again from that news alone.
- Each question is **direct** (about the news item itself), **related** (the wider issue a story
  is part of, with a concrete head start) or **none**, and flagged when it rests on news the map
  doesn't hold. Matching was done by Claude agents against the map only, without the web.
- Hit rate = stories in a corner that got at least one direct or related question, counting each
  story once per paper. Lag = months from a story's hottest pre-cutoff month to the exam.

## 2026-10-18 — News heat map, built blind

- The user's idea: score every news story month by month from January 2024, then compare the
  map with UPSC's past papers to learn which kinds of news UPSC draws on, and use that to
  prioritise current affairs for the 2027 exam. The user chose layout C (story lifecycles)
  from three mocks.
- **Blind:** the map is built from the news alone. Researchers never open past papers, coaching
  compilations (they are shaped by past papers) or `data/`. The map is frozen (`frozenAt`, a
  commit in the notes repo) before any past paper is opened for the comparison.
- **Two numbers per story-month:** coverage (how much the news covered it, judged from
  developments, editorials and explainers) and exam weight (Claude's judgement, made without
  past papers). Coverage can't leak exam knowledge; weight can, because Claude has read past
  papers in training. The comparison will show which predicts better.
- **Sources:** web news and official sources only. Not CA Tracker Pro: its terms forbid giving
  the archive to an AI.
- Peak loudness is the mean of a story's three hottest months among those at medium or above,
  so a quiet tail doesn't drag a spike down; long means hot for 6+ months, loud means a peak of
  High (3) or more.
- Stored as one value (`content/heatmap.json`, Firestore `heatmap/current` in parts); the app
  reads it, only the CLI writes it. A frozen map is replaced only with `--force`, on the user's word.

## 2026-10-18 — Proposals, history and the feed (M4)

- Every change Claude wants in a note's text is a **proposal** (`edit` an exact phrase, `add` a
  block after another, `row` in a table, `check` an open check), stored per page like threads
  (`proposals/<collection>-<id>`). New text always carries its source marker. The CLI checks a
  proposal applies before saving it, so the user never sees one that can't.
- Approving applies the change in the save API (one shared function, `src/lib/approve.ts`, for
  the dev API, the cloud API and the CLI), saves a version with a labelled history snapshot
  ("Approved: …"), and closes the flag it came from. A proposal that no longer fits is marked
  stale, not forced.
- History lists labelled snapshots with a line diff against now; Restore saves the old version
  as a new one, so nothing is lost. Approvals and restores always snapshot.
- The review UI is a bar and a drawer (not proposals inside the editor's document), with a
  dashed outline on the affected blocks: robust with BlockNote, and works on phones.
- The feed keeps the existing fetcher (PIB, PRS, Supreme Court) and embedding matcher, now
  reading the Firestore mirror; Claude files `atlas propose --feed` instead of inbox files.
  The twice-daily task runs it; Claude never approves.

## 2026-10-17 — OAuth sign-in for the MCP server

- The Gemini app and Claude's custom connectors connect only by OAuth, so the hosted server
  is also an OAuth 2.1 authorization server, per the MCP authorization spec: protected-resource
  and authorization-server metadata, dynamic client registration, PKCE (S256 only), rotating
  refresh tokens, and a `WWW-Authenticate` hint on a 401.
- Approval happens on the app's own `/oauth/authorize` page, behind the same Google sign-in and
  `atlasOwner` check as the notes. The owner picks which AI the app is; that labels what it
  posts. A Claude.ai connection is "Claude app" (`claudeapp`), distinct from Claude's CLI.
- Codes (5 min, single use), access tokens (1 h) and refresh tokens (90 days) are stored only as
  hashes in closed Firestore collections. `atlas oauth revoke` turns off an app and its tokens.
- The consent page returns to the app with a plain navigation, not a form post or 302, which
  avoids a reported failure with Google's redirect relay. Per-AI keys still work alongside.

## 2026-10-17 — Hosted MCP server for any AI

- The Atlas MCP server runs as a Cloud Function (asia-south1, 2nd gen) behind Firebase
  Hosting at `https://recall-atlas-511913.web.app/mcp`: one fixed address that works with the
  Mac off, replacing quick tunnels whose address changed each run. Needs the Blaze plan.
- Any MCP client can connect, not only Grok. Bots are AI-neutral personas (Debater, Reviewer…);
  which AI is calling comes from its key. Turns record `ai`, a flag's first comment is
  authored by the AI, and the app names the AI ("Gemini · Reviewer"). A seat can be pinned to
  one AI.
- One key per AI, stored only as a SHA-256 hash in Firestore `mcpKeys/` (closed to the app by
  the rules), revocable at once (`atlas mcp-key revoke`). Browser requests are refused.
- The flag tools from PR #32 moved onto the shared backend (files or Firestore).
- `atlas export` now prunes files for pages, comments and discussions deleted from
  Firestore, so the notes repo mirrors Firestore exactly.

## 2026-10-17 — Firebase backend (M3): same routes, Firestore underneath

- Firebase project `recall-atlas-511913` (named "Recall-atlas" by the user; the plan had
  suggested `mains-atlas`). The web config lives only in git-ignored `app/.env.local`.
- The app keeps its one API choke point (`api(path)` in `content/store.ts`). The cloud build
  (`vite --mode cloud`) answers the same routes from Firestore (`content/cloud.ts`); the local
  build keeps the dev save API, so local work, the fixture and every existing test are
  unchanged. MODE is checked inline so the local bundle carries no Firebase code.
- Each Firestore document stores its data as one JSON string (`json`). BlockNote table cells
  are arrays inside arrays, which Firestore can't hold, and undefined fields would be refused.
  Title, version and updated stay as plain fields for the console. A page must stay under
  Firestore's 1 MiB document limit; the largest today (a study file) is about 270 KB.
- Owner-only access is a custom claim, `atlasOwner`, set with the Admin SDK
  (`atlas owner <uid|email>`), not a UID in `firestore.rules`: the public repo then holds no
  account id, and rules need no extra document read.
- Comments, discussions, progress and captures are one document per page (or one each),
  changed in transactions over the same pure operations the file API uses.
- The CLI and the MCP server share a `Backend` interface (`server/backend.ts`): files when
  `ATLAS_CONTENT_DIR` is set, otherwise Firestore through the Admin SDK with a
  service-account key kept outside the repo (`~/.config/mains-atlas/`). `atlas import` copies
  the notes repo's content folder in once; `atlas export` writes the Markdown mirror back out.
- Saves need a connection (they run in transactions); reading works offline from
  Firestore's cache. Signing out clears that cache from the device.
- A hand-written service worker caches only the app shell, never note content.

## 2026-10-17 — Study files are parented notes

- The user is piloting a long "study file" beside each short note. It is a note page with a
  `parent` field, not a new collection or route, so the editor, comments, search and save API
  work unchanged. `locateNote(id, parent)` places it under the parent's paper › subject ›
  topic, and the breadcrumb ends with the parent note.
- It is not in the syllabus tree, so subject counts ignore it, and opening it does not start a
  revision cycle (revision is tracked on the parent note).

## 2026-10-16 — Colourful, Evernote-inspired look; subject databases; quick capture

- The user found the Paper look too plain and the topic tree too cluttered, and chose a
  colourful mock: warm ground, a colour per subject, rounded green buttons, lavender for
  Claude (https://claude.ai/artifact/V5VbeLQ3hFE9LAgjf8k5Pe). Fonts: Bricolage Grotesque headings, Figtree text.
- Structure: Evernote-style shell (short sidebar, home dashboard) with a Notion-style
  database inside each subject. Topics are groups in the table, not pages.
- Fixed columns made for UPSC (status, revision, confidence, Claude, comments), not a
  general database with user-defined properties.
- Revision: simple spacing (1 day after first reading, then 3/7/21/60 days; weak ×½,
  strong ×1.5). No streaks, points or gamification.
- The green button is Quick capture (the most frequent action while reading the paper);
  "···" holds new microtheme note and new concept card. Captures are the user's own words;
  CA Tracker Pro text is never pasted for AI processing (its terms forbid it).

## 2026-10-16 — Editor: BlockNote, block JSON as the source of truth

- The user wanted a small Notion for UPSC: block editing, a side peek for links, and
  comments that can be resolved, pinned as permanent sticky notes, or sent to Claude.
- Compared Tiptap, BlockNote, Milkdown Crepe and Plate. With Markdown no longer required
  as the stored format, **BlockNote** wins: the most Notion-like out of the box, MPL-2.0
  core, a comments extension with a pluggable `ThreadStore`, and React custom blocks. Its
  XL packages (GPL/AGPL) are not used.
- Pages are stored as BlockNote JSON. A Markdown copy is written on every save for git
  diffs, other agents and backup; it is never read back.
- Comments use BlockNote's comment marks with our own `AtlasThreadStore` (no Yjs). Marks are
  not part of block JSON, so threads store an anchor (block id + quoted text) and the app
  restores highlights on load.
- Editing and comments come before Firebase: the dev server saves files on the Mac (M2).
  Firebase (M3) then replaces only the store and API layer.
- Supersedes the M0 decisions on Markdown-in-Firestore and the Milkdown/Tiptap spike.

## 2026-10-16 — Pivot to the Mains Atlas reader

- The mind-map / study-graph product is retired. The user found graphs confusing and wants
  living, Mains-focused revision notes per note unit.
- A Claude Docs pilot (hub doc, concept cards, three notes) proved the note format and the
  Claude workflow. Its navigation had too much friction: two clicks per link, no back,
  no hover previews. The product is therefore our own app.
- The old app (the Codex PRs #2–#24) is not carried over. `claude/atlas-reader` starts from
  `main`, which never contained it.
- Design: Mock A · Paper, chosen by the user from three clickable mocks.
- Stack: Vite + React + TypeScript; Firebase Hosting, Auth (Google, owner only) and
  Firestore; a PWA for Android and iPad.
- Content: Markdown with `[[card|label]]`, `chart` and `mermaid` extensions; stored in
  Firestore and mirrored to the private notes repo.
- Editor: Milkdown Crepe vs TipTap, decided by a spike in M4.
- Claude works through an Admin SDK CLI on a twice-daily schedule; facts change only
  through approved proposals or the user's explicit comments.

## Earlier (graph era, superseded)

- 2026-10-03: Public code repository; separately stored private corpus. Still applies.
- 2026-10-03: Firebase Hosting chosen; deploy only after a project is explicitly selected. Still applies.
- 2026-10-03: Protect main with required PR and checks, no force pushes or deletion. Still applies.
- 2026-10-03/04: React Flow graph, node expansion rules, six-category colours. Superseded.
