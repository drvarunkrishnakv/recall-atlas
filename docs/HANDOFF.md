# Handoff

## Integration: M7–M12 in one branch — 2026-10-21

- **Branch:** `claude/atlas-integration`, from `claude/m7-mcq-loop`, with M9 (#49), M10 (#50),
  M11 Prelims (#51), M8 (#52), M12 (#53) and M11 Mains (#54) merged in. Assisting tool: Claude
  Code (the milestones were built side by side by helper agents from one shared brief).
- **Conflicts resolved:** the shared files (dev API, cloud API, CLI, backends, Firestore rules,
  icons, sidebar registry, docs). Both sidebars follow the chosen order.
- **Fixes made while joining:**
  - M11 read M9's weekly note in a shape M9 doesn't send; it now reads `{weeks, latest}` and
    links each line to its route.
  - M10's puzzle-only banks no longer show as empty topics on subject pages or count as extra
    PYQs.
  - Rush and Flashcards links sit under the Puzzles button on the new Prelims Home.
  - The Board versions of `.chip`, `.chip-btn`, `.muted` and `.small` moved from prelims.css to
    index.css, so older Mains pages no longer change look after a practice page has loaded.
  - The lesson follows the app's theme (the user's review: no dark panel in a light shell). See
    DECISIONS, the M9 entry.
  - The old `HomePage` was removed from `dashboard.tsx`; Mains Home replaced it.
- **After the user's review (21 Oct):** the Mains sidebar is the chosen eight entries; the big
  button is "Today's answer" / "Practise now" and Capture is in the ··· menu; Revise today,
  Concept cards and the News heat map are chips on Notes; a written note's name in Notes opens
  the full note (DECISIONS, "A shorter Mains sidebar").
- **Answers:** the 7 contested 2009–2011 questions are retired (kept, never served).
  `data/grok_check/ANSWERS-REVIEW.md` has the full record.
- **Live 2026-10-21** (on the user's say-so, from `claude/atlas-integration` 1128e8b, PR #55 not
  yet merged): `firebase deploy --only firestore:rules` and `--only hosting` (firebase-tools 15,
  from the internal-disk copy). Content loaded into Firestore with the CLI: 144 banks (1,890
  PYQs, 1,856 served; 1,161 true-or-false puzzles), 974 Mains questions, 24 essay topics, 6
  ethics cases, 65 Medical Science lines. Live checks: the site serves the new bundle; signed-out
  reads of items, attempts, mainsq, answers, lessons, essay and reading return 403; `/mcp`
  without a key returns 401. The shell's `GOOGLE_APPLICATION_CREDENTIALS` points at another
  project's (missing) key: run the CLI with it unset so it uses
  `~/.config/mains-atlas/service-account.json`.
- **Storage live 2026-10-21:** the user created the default bucket
  (`recall-atlas-511913.firebasestorage.app`) in the console; `firebase deploy --only storage`
  released `storage.rules`. Live checks: signed-out list and upload under `answers/` return 403;
  the deployed build already names this bucket (`VITE_FIREBASE_STORAGE_BUCKET`). The app uploads
  with `uploadBytes` and shows photos through download URLs, so the bucket needs no CORS setting.
  Not yet tried signed in from a phone.
- **Not done:** scheduling the marking,
  nightly-lesson and weekly-note runs (docs/routines/); the `mcp` function was not redeployed
  (unchanged for its tools). No real flashcards yet: Claude-written cards need the blind
  fact-check first.

## Mains Home and Mains Analytics (M11, Mains half) — 2026-10-21

- **Branch:** `claude/m11-mains-homes`, from `claude/atlas-integration` (826c609: M7, M8, M9, M10
  and the Prelims half of M11). Assisting tool: Claude Code. Built alongside M12, which works from M7.
- **App:**
  - Mains Home at `/` (Mains 1 · Centre stage), replacing the old home. In the centre, "Today's
    answer": a big amber button (glowing, still under reduced motion, first on phones) with the
    question M8's `suggestQuestions` picks first (a retry due, else a new question with a written
    note), its paper, year, words and minutes, linking to `/mains/write?q=<id>`. Left: notes due
    (soonest first, with "Revise P06" and Revise today). Right: the last feedback (score, written
    when, keep, the biggest fix, Open feedback) and "N answers waiting for marking", or the waiting
    answer alone before any is marked. Above: a "From Claude" strip (note updates to approve,
    replies, flags, filed captures, answers marked and disputes answered this week, the weekly
    note's Mains lines; Open inbox). Header: today's answers against the target and the days to
    Mains. Then six paper tiles (GS1–4, Essay, Medical Science at 500): average answer score, notes
    written with the subject linked (Polity → `/gs2/polity`), a coverage bar; a tile leads to
    `/mains/notes?paper=gs2`, `/mains/essay` or `/mains/medical` (M12's routes). Then "This week in
    your notes" (approved changes with their source dates, and edits; "Latest changes" when the
    week is quiet), Continue reading and the scratch pad.
  - Mains Analytics at `/mains/analytics` (MAna-1 · The week's story): Claude's Mains lines from the
    weekly note pinned on top, each linked to its evidence; until there are any, the story worked
    out on the device, each line jumping to its section. Six headings over their charts: scores by
    week (coloured columns out of 10), marks kept per checklist item (with a link to the costliest
    fix tag), self-score gap and time per 10-marker by month (7:00 marked), answers a week against
    the target band (7–14 now), and marks still open per paper. 8 weeks by default, 4 weeks or all
    time (`?range=`). No predicted score until two full papers are marked.
  - "Analytics" in the Mains sidebar. Prelims Analytics now leaves the note's Mains lines out.
- **Engine:** `src/lib/mains-analytics.ts` (DECISIONS 2026-10-21: the daily answer target's ramp,
  full papers and the prediction gate, marks still open, the note split by route, what moved
  from the old home). `atlas week-data` gives each week a `mains` block for the weekly note, and
  `docs/routines/weekly-note.md` says how to write Mains lines. Nothing new is stored.
- **Fixture:** three made-up marked answers (GS1 on 29 Sep and 14 Oct, GS2 on 8 Oct) with photos;
  none carries the tags or scores M8's tests count. M8's fixture test now expects 6 answers.
- **Checks** (internal-disk copy, installed Chrome): Prettier, `tsc -b`, 199 unit tests (18 new),
  build (local and cloud); `npx playwright test e2e/m11-mains.spec.ts` 13 passed + 2 skips (5 tests
  × desktop, iPad, Android; the weekly-note test runs on desktop only); full `npx playwright test`
  127 passed, 29 skipped and 6 failed. The 6 failures already happened on `claude/atlas-integration`
  before this branch (baseline: 114 passed, 6 failed, 27 skipped). They are M10's "Prelims Home and
  the sidebar lead to flashcards…" (it looks for `.start-opts`, which the M11 Prelims Home dropped)
  and M11-Prelims' Analytics test (it expects "No weekly note yet." while M9's fixture has a note),
  each × 3 sizes. `test:cloud` was not rerun: no Firestore code or rules changed. Screenshots
  (fixture): `docs/design/m11-mains-homes/`.
- **Not done:** the target doesn't yet adapt to what you actually write; Medical Science and Essay
  tiles show answer averages only (their own screens are M12's); the old `HomePage` is left
  unused in `dashboard.tsx` until M12 has merged; deploying.

## Nightly engine (M9) — 2026-10-21

- **Branch:** `claude/m9-nightly`, stacked on `claude/m7-mcq-loop`. Assisting tool: Claude Code.
- **Why:** the user asked for the whole app to be built from the chosen screens; M9 is the
  nightly lesson, the morning quiz and the weekly note (BUILD_PLAN).
- **App:**
  - Tonight's lesson, `/prelims/lesson?day=` (Lesson 3 · Stack). One card per concept,
    stacked, with a progress line. Each card opens with "your mistake" (the slipped statement
    and your mark against the truth, your option against the answer, sure or unsure), then the
    teaching paragraphs, a comparison table when facts are easily confused, a "Remember" line
    and the sources. A card not yet fact-checked says "Not fact-checked".
  - "Got it" flings a card right and "Still shaky" flings it left, by drag, by the buttons or
    by → / ←. Undo brings the last card back and takes its rating away. The motion takes about
    0.35 s, and with reduced motion the card just changes. Ratings are saved at once and
    survive a reload, which reopens on the first card not yet rated.
  - The lesson is a warm, dim night panel (a night variant of the Board tokens, scoped to the
    lesson) in light and dark alike (DECISIONS 2026-10-21). The end summary gives the quiz
    size and the shaky count, and links to the morning quiz.
  - The morning quiz, `/prelims/quiz?day=`: M7's session (`Run`, now exported, with mode
    "quiz") on the latest lesson's quiz items. Answers are saved with mode "quiz".
  - The Mistake notebook's question pane links to "Tonight's lesson on this" when a lesson
    card teaches that question. The sidebar has "Tonight's lesson" and "Morning quiz".
- **Engine:** `src/lib/lessons.ts`: lessons, cards, ratings and weekly notes with their checks,
  "your mistake" from an attempt and its item (using `statementTruth`), the shaky queue (back
  until "got" on two different later days), the misses feed and the week's facts.
- **Storage:** files `practice/lessons/<day>.json` and `practice/weeks/<week>.json`; Firestore
  `lessons/{day}` (owner read and update, never create or delete) and `notes-week/{week}`
  (owner read only). Routes: `GET /api/lessons`, `GET|POST /api/lessons/<day>`,
  `GET /api/weeks[/<week>]`.
- **CLI** (`cli/lessons.ts`): `misses [--day]`, `lesson-write <day> <lesson.json>`, `lessons`,
  `week-note <week> <note.json>`, `week-data [--weeks 1]`. `lesson-write` checks the cards,
  the item ids and that every quiz item may be served, keeps ratings already given, and adds
  the shaky cards due back.
- **Routines (docs only, nothing scheduled):** `docs/routines/nightly-lesson.md` and
  `docs/routines/weekly-note.md`. Both forbid CA Tracker Pro content and showing an unchecked
  fact as checked.
- **Content:** none. No real lesson or weekly note was written: a real lesson needs the user's
  own misses and the blind fact-check pipeline on a scheduled run, which the user turns on.
  The fixture has one made-up lesson (20 Oct 2026, items fx-1 to fx-3) and one weekly note.
- **Checks** (internal-disk copy): Prettier, `tsc -b`, 111 unit tests (15 new), build;
  `npm run test:cloud` 26 passed (3 new: lesson and weekly-note rules, the cloud API, the CLI's
  Firestore backend); `npx playwright test e2e/m9.spec.ts` 12 passed (4 tests × desktop, iPad,
  Android); full `npx playwright test` 81 passed + 24 skips. Screenshots (fixture):
  `docs/design/m9-nightly/`.
- **For M10:** the stack's motion (drag, fling, slide forward, return on undo) is in
  `src/lessons/Lesson.tsx` and the `ls-*` keyframes in `src/lessons/lessons.css`, ready to
  carry over to the flashcard screen as the user asked.
- **Not done:** the weekly note on the Analytics screen (M11 reads it with `useWeeklyNotes`),
  the Mains lesson inside `/mains/answers/:id` (after M8), scheduling the two routines, and
  deploying (needs the user's go-ahead, plus `firestore:rules`).

## Flashcards, puzzles and Rush (M10) — 2026-10-21

- **Branch:** `claude/m10-cards-puzzles`, stacked on `claude/m7-mcq-loop`. Assisting tool: Claude
  Code. Built alongside M8, M9, M11 and M12 in their own worktrees.
- **App:**
  - Flashcards (`/prelims/cards`, Flashcards 1 · Classic stack): a tall card with its subject's
    colour and the next two peeking behind; type an answer (or not) and flip (3D); the back shows the
    answer, how your typing compares and rings the suggested grade. Fling right for Knew it, left for
    Forgot (0.35 s, as the lesson stack), or press Hard / Easy; keys Enter, ← →, 1–4. Cloze, Q&A, list
    (items ticked off, tap to change) and picture cards. FSRS plans the deck (due first, then new);
    `?banks=`, `?n=`, `?items=`. A short summary at the end; no motion when the device asks for less.
  - Puzzles (`/prelims/puzzles`, Puzzles 1 · Arena, phone first): an endless, untimed stream near
    your rating; the rating on top with ± after each, each puzzle's difficulty, its subject and (for
    a PYQ statement) its year. True or false, match the pairs, put in order, pin on the map. A miss
    shows the right answer and why and is logged for tonight's lesson. A subject filter (in the URL),
    tick and buzz (WebAudio and vibration, mutable, remembered), and a summary when you leave.
  - Rush (`/prelims/rush`, Puzzles 3 · Rush): true or false for 3 minutes or 3 strikes, its own best
    score (from the log), misses listed and logged, no effect on the rating.
  - Prelims Home: three links (Flashcards, Puzzles, Rush); banks with no MCQs aren't listed as
    topics. Sidebar: Flashcards, Puzzles, Rush.
- **Data:** `lib/practice.ts` gained puzzle styles (`tf`, `match`, `order`, `map`), image cards
  (`image`, `alt`) and an optional `why` on cards, and an optional `session` on attempts; Rush
  answers may not carry a `delta`. `lib/puzzles.ts` (Elo, the next puzzle, Rush runs and best),
  `lib/flashcards.ts` (the typed-answer check, grade mapping, "back in …"). Storage, rules and the
  CLI are unchanged.
- **Content:** a private script, `data/practice_build/derive_puzzles.py`, made 1,161 true-or-false
  puzzles in 15 banks (`<subject>-tf`) from 453 verified PYQ statement questions (of 910 read), and
  they were imported into the local content folder only (no `--replace`; 144 banks, 3,051 items).
  Not imported into Firestore; that needs the user's go-ahead:
  `node cli/atlas.ts practice-import ../data/practice_build/tf_banks.json`. Its report, with what
  was skipped and why, is `data/practice_build/tf_report.md`. No real flashcards: they need the
  blind fact-check pipeline; the fixture has one card of each style.
- **Checks** (internal-disk copy): Prettier, `tsc -b`, 118 unit tests, build; `npm run test:cloud`
  23 passed; `npx playwright test` 86 passed + 25 skips (installed Chrome; new `e2e/m10.spec.ts`,
  17 passed + 1 skip, on desktop, iPad and Android: a card typed, flipped, flung and saved; list
  and picture cards; each puzzle style right and wrong with the rating moving; the filter and the
  sound switch; Rush to three strikes with the best kept after a reload). Screenshots (fixture):
  `docs/design/m10-cards-puzzles/`.
- **Not done:** deploying; real flashcards and generated MCQs (M10's second line); importing the
  true-or-false banks into Firestore.

## Prelims homes and analytics (M11, Prelims half) — 2026-10-21

- **Branch:** `claude/m11-prelims-homes`, stacked on `claude/m7-mcq-loop` (be719cf). Assisting
  tool: Claude Code. Built alongside M8, M9 and M10; the Mains Home and Mains Analytics wait for M8.
- **App:**
  - Prelims Home (Board 1 · Centre stage): a big animated Puzzle button in the centre (still under
    reduced motion; first on phones) with the rating; Practise (sizes, exam mode, due counts, and
    "Today's reading" once a topic is logged today) and Reviews (due MCQs and flashcards) on the
    left; tonight's lesson and the morning quiz on the right, or "No lesson yet"; a 3×3 board of
    the nine most-asked subjects (readiness, change this week, due, weak spot), the rest listed
    below; Prelims readiness overall.
  - Subject page (Subject 2 · Table + drawer) at `/prelims/subject/<slug>`: one row per topic in
    book order with PYQs (count, year last asked, heat tint), readiness, MCQs and flashcards
    (total · due) and Read; rows open into microthemes. Sorts (book order, most asked, weakest,
    most due) and filters (weak, not read yet, due) live in the URL. A count opens the drawer
    (totals, due, recall and average time over 4 weeks, a 14-day strip, weak microthemes, your
    traps from the miss reasons, Start); on phones it is a page of its own, and back closes it.
    Header: readiness, an 8-week trend, Practise, Try before reading, Log reading (+ Undo).
  - Prelims Analytics (Analytics 3 · The week's story) at `/prelims/analytics`: the weekly note
    pinned on top (or its empty state), readiness and its five parts with weekly changes and
    trends, then story headings worked out from the log, each over its chart: the biggest mover,
    the week's misses, speed by week, calibration with your guessing rule (2.667p − 0.667), where
    the marks are, and folded Effort (calendar against the daily target) and Mock tests (empty
    until January; no predicted score before three mocks). 8 weeks, 4 weeks or all time.
  - "Analytics" in the Prelims sidebar.
- **Engine:** `src/lib/readiness.ts` (weights and why: DECISIONS 2026-10-21), `src/lib/reading.ts`;
  `src/lib/srs.ts` gained `nextReviewState` and `retrievability`.
- **Storage:** the reading log, `reading/{subject}` (owner read, create, update) and
  `practice/reading/<subject>.json`, through `GET /api/reading` and `POST /api/reading/<subject>`.
  Lessons and the weekly note are optional reads of `GET /api/lessons` (and `/api/weeks`); a 404
  shows the empty states (ARCHITECTURE, Practice).
- **Fixture:** a made-up second subject, "Sample geography" (three topics, 10 MCQs, 3 flashcards),
  26 made-up attempts from 8 Sep to 20 Oct 2026 and a reading log. M7's home test now expects
  "13 questions ready" and the "Sample subject" tile instead of a "Sample topic" link.
- **Checks** (internal-disk copy): Prettier, `tsc -b`, 126 unit tests, build; `npm run test:cloud`
  24 passed (new: the reading log's rules and routes); `npx playwright test` 81 passed + 24 skips
  (installed Chrome; new `e2e/m11-prelims.spec.ts`, 4 tests × 3 sizes, clock fixed to 21 Oct 2026).
  One earlier run, with a second dev server busy beside it, timed out on two unrelated desktop
  tests (the AI flag and the heat-map questions); both pass alone and in the clean rerun. Screenshots
  (fixture, desktop and phone, light and dark): `docs/design/m11-prelims-homes/`.
- **Not done:** the Mains Home and Mains Analytics (after M8); deploying (needs the user's
  go-ahead, plus `firebase deploy --only firestore:rules` for `reading/`). No real content was
  imported.

## Mains answer loop (M8) — 2026-10-21

- **Branch:** `claude/m8-mains-answers`, stacked on `claude/m7-mcq-loop`. Assisting tool: Claude
  Code. Built overnight alongside the other milestones, from the chosen mocks (Write 1 · Stepper on
  phones, Write 3 · Desk + phone on wider screens, Feedback 1 · Marked page, Feedback tab 1 ·
  Table + pattern drawer, and the "It asks for" box from Mains 3).
- **App:**
  - Sidebar (Mains): Write and Feedback after Home.
  - `/mains/write`: retries due first, then new questions (a written note first), a paper filter,
    "Different question" and a short list of others. The question card shows "It asks for", length
    and time, and the note. An optional 1-minute plan, then a big countdown (7 min for 10 marks,
    11 for 15) in a dimmed full-screen exam hall, with a buzz and two soft beeps at one minute left;
    overtime keeps counting and is logged. Then 1–3 page photos (shrunk on the device, turned a
    quarter turn at a time, reordered, removed), "your score first" with what you think you missed,
    and "Sent for marking". The desk shows a QR code (made on the device) to
    `/mains/write?answer=<id>`, so the phone adds photos to the same answer while the desk watches.
    Questions without recorded marks offer a 10/15 switch. `?drill=<tag>` shows a fix tag's drill.
  - `/mains/answers/:id`: waiting for marking until the run, then the photo with numbered pins in
    examiner pen colours and their comments, "Check my reading" (unsure words highlighted, your
    corrections saved), the checklist out of 10 with "I disagree" on each item (waits for the run,
    then shows changed or kept with the reason), Fix first with keep and the fix tags, the stronger
    outline behind a tap, "Rewrite one part" (timer, photo, logged beside the original; the score
    stays), "From your notes, you could have used…" with note links, and earlier attempts side by
    side with what got better and the gaps that repeated. On narrow screens the marks come right
    after the page.
  - `/mains/feedback`: this month's average against last month's, how far self-scores are off,
    the costliest fix and disputes; filters by paper, fix tag and "Retry due"; a row opens its page;
    a tag opens its pattern (count, marks lost, change against last month, what it means, each
    time it showed, and a drill).
- **Data:** `src/lib/mains.ts` (questions, answers, the marking and its checks, the AnswerOps, and
  the Feedback numbers), with 17 unit tests. Files `content/mains/{questions,answers,photos}/`;
  Firestore `mainsq/{paper}` (read-only to the app) and `answers/{id}` (no deletes); Storage
  `answers/{id}/page-{n}.<ext>` under the new `storage.rules`. The app's ops can't mark: marking,
  resolving and rewrite marks go through the CLI. Decisions: DECISIONS (2026-10-21).
- **CLI** (`cli/mains.ts`): `mains-import`, `mains-questions`, `answers-waiting [--json]` (photos as
  file paths; downloaded from Storage first on Firestore), `mark`, `mark-rewrite`, `disputes`,
  `resolve-dispute`, `answers`. The marking run's prompt: `docs/routines/mark-answers.md` (not
  scheduled).
- **Content:** a private script (`data/mains_build/build_questions.py`) built the register's 974
  Mains PYQs (GS1 267, GS2 275, GS3 266, GS4 166) and imported them into the local content folder
  only. 86 carry a word limit from the paper (37 with marks); 888 are set as 10-markers of 150
  words and flagged. 129 link to a Polity note unit. "It asks for" is built from each question's
  sentences and directive words. Not in Firestore yet; that needs the user's go-ahead:
  `node cli/atlas.ts mains-import ../data/mains_build/questions.json --replace`.
- **Checks** (internal-disk copy): Prettier, `tsc -b`, 113 unit tests, build (local and cloud);
  `npm run test:cloud` 31 passed (now with the Storage emulator; new: Mains rules, cloud API,
  Storage rules, and the CLI's Firestore and Storage steps); `npx playwright test` 79 passed + 26
  skips (installed Chrome; new `e2e/m8.spec.ts`: writing to "Sent for marking" with a photo, the
  marked page with a dispute that survives a reload and the outline on tap, and the Feedback tab's
  filters, drawer, retry due and rows). Screenshots (fixture): `docs/design/m8-mains-answers/`.
- **Not done:** enabling Firebase Storage and deploying `storage.rules` and the Firestore rules
  (`firebase deploy --only storage,firestore:rules`), importing the questions into Firestore, and
  scheduling the marking run, each with the user's go-ahead. On the dev server the QR code points
  at `localhost`, which a phone can't open; use the cloud build, or the LAN address with
  `ATLAS_ALLOW_LAN_WRITES=1`.

## The rest of Mains (M12) — 2026-10-21

- **Branch:** `claude/m12-mains-rest`, stacked on `claude/m7-mcq-loop`. Assisting tool: Claude Code.
- **Why:** the build order's last Mains step (BUILD_PLAN M12): Essay, Ethics case studies and
  Medical Science, plus the Board versions of the Mains Notes table and the Claude inbox, each as
  the "table + drawer" the user chose (Essay-1, Ethics-1, Med-1, Notes-1, Inbox-1).
- **App** (sidebar: Notes, Essay, Ethics case studies, Medical Science):
  - Essay (`/mains/essay`): topic table and decode drawer. Claude's breakdown (what it asks,
    keywords, six angles, evidence from your notes) opens only after you write your own angles.
    Outline sprint (20 min: thesis, opening, seven tagged paragraphs, the other side, closing;
    checked and saved), full essay (1 h 30) and full paper (3 h with a time plan and a ready
    check); both end with the Write flow's photo link (`/mains/write?essay=<id>`).
  - Ethics (`/mains/ethics`): Claude's practice cases, labelled; UPSC cases "not loaded". The
    bench: stakeholders, issues and values, options (Do / Weak / Never), decision, a fix for the
    system, then the 250-word answer in 11 minutes (typed, or `/mains/write?ethics=<id>`).
    "Compare with mine" opens per step after your own attempt; no mark.
  - Medical Science (`/mains/medical`): Paper I (7 subjects) and II (6), 65 lines, your rating
    (Rusty / OK / Strong), PYQs per line, key diagrams with a 3-minute drill (time logged, then
    `/mains/write?medical=<line>`), answers, and Claude's checked notes on dated syllabus wording.
  - Mains Notes (`/mains/notes`): GS1–4, Essay, Medical Science; subject tabs; every planned
    note under its syllabus topic with Mains PYQs (count, last asked, heat), your answers (M8),
    written or not, and Claude's column (sources waiting, open checks, or "Draft next"); a drawer
    per note. Note pages and `/gs2/polity` are unchanged.
  - Claude inbox (`/inbox`): the same items in a table, "Needs you" and "For your information",
    a drawer per item. A proposal shows its line, section, why, source, confidence and check, with
    Verify, then add / Edit / Reject and "Add it now, marked unverified".
- **Data:** `src/lib/mains-extra.ts` (shapes, checks, ops, helpers; 16 tests). Files under
  `content/mains/`, Firestore `essay/`, `ethics/`, `medical/` with `mine-` records (rules: content
  read-only, records create/update only). Routes `GET /api/mains-extra`, `POST
  /api/mains-extra/<kind>/<id>`. Proposals gained `confidence`, `verifyRequested`, `revised`,
  `unverified` and the ops `verify`, `revise`, `unverified` (3 tests). CLI: `mains-extra`,
  `mains-extra-import <file> [--replace]`, `mains-extra-work [kind]`; `propose --confidence`;
  `proposals` flags the ones waiting for a source check.
- **Content (local content folder only, not Firestore):** built by `data/mains_extra/build.py`
  (private) and imported with `mains-extra-import --replace`: 24 essay topics (2024, 2025, 2026)
  with breakdowns, 6 practice cases in full, 65 syllabus lines with 721 PYQ sub-parts as main
  line (2014–2026) and 34 key diagrams. Firestore import needs the user's go-ahead:
  `node cli/atlas.ts mains-extra-import ../data/mains_extra/mains-extra.json --replace`.
- **Checks** (internal-disk copy): Prettier, `tsc -b`, 115 unit tests (19 new), build and cloud
  build; `npm run test:cloud` 26 passed (3 new: the M12 rules, the cloud routes, the CLI's
  Firestore side); `npx playwright test` 89 passed + 31 skips (installed Chrome; `e2e/m12.spec.ts`
  adds 20 runs over the three sizes). Screenshots (fixture): `docs/design/m12-mains-rest/`.
- **Not done:** deploying (and `firestore:rules`); UPSC case studies and the 2013–2023 essay
  papers; "source waiting" for unwritten notes (needs the feed to record matched sources); the
  Write flow (M8) must keep `question.note` and add `essay|ethics|medical` on answers for the
  answer columns to count them.

## Prelims MCQ loop (M7) — 2026-10-21

- **Branch:** `claude/m7-mcq-loop`, stacked on `claude/practice-foundations` (PR #47). Assisting
  tool: Claude Code.
- **Why:** the user asked for the whole app to be built from the chosen screens; M7 is the first
  step after the foundations (BUILD_PLAN).
- **App:**
  - Prelims Home: countdown, rating, "Practise now" (20/50/100, answer after each or exam mode)
    and every topic grouped by subject with its due and new counts.
  - The session (Session 3 · Statement marks): ✓/✕ per statement lights up the option the
    marks point to (also for "how many are correct"); marks only appear when the options are
    about the statements. Sure/unsure lock-in, a clock that turns red after 72 s, feedback with
    each statement's truth and where a mark slipped, the eight grade buttons with FSRS "back
    in …", exam mode, keys (A–D, S/U, 1–5, Enter) and a summary (UPSC marks, rating change,
    sure/unsure accuracy). Under each answer: whether it comes from UPSC's final or provisional
    key, or (2009–2011) from the register, Grok and Gemini agreeing.
  - The Mistake notebook (Notebook 2 · Two panes, plus the revision book): filters, "fixed"
    after right answers on two later days, and "Practise N shaky ones".
  - The floating Capture button hides on practice screens.
- **Engine:** `src/lib/srs.ts` (FSRS state rebuilt from the attempt log, session planning,
  counts), `src/lib/statements.ts` (what each option says about the statements),
  `src/content/practice.ts` (the store; answers are saved optimistically).
- **Storage:** dev API and Firestore both answer `GET /api/practice` and
  `POST /api/practice/attempts/<day>`. CLI: `practice`, `practice-import <banks.json>
  [--replace]`, `attempts [--days 7]`.
- **Content:** the register's PYQs were built into 129 banks by a private script
  (`data/practice_build/`) and imported into the local content folder: 1,890 questions, 1,856
  served. Not imported into Firestore yet; that needs the user's go-ahead:
  `node cli/atlas.ts practice-import ../data/practice_build/banks.json --replace`.
- **Checks** (internal-disk copy): Prettier, `tsc -b`, 96 unit tests, build; `npm run
  test:cloud` 23 passed; `npx playwright test` 69 passed + 24 skips (installed Chrome; new: a
  session with statement marks and a miss that reaches the notebook, exam mode with keys).
  Screenshots (fixture): `docs/design/m7-mcq-loop/`.
- **Not done:** deploying (needs the user's go-ahead, plus `firestore:rules`).

## Practice foundations (M6) — 2026-10-20

- **Branch:** `claude/practice-foundations`, from `main` (9c34a97). Assisting tool: Claude Code.
- **Why:** the user agreed a build order for Prelims and Mains practice (DECISIONS 2026-10-20)
  and asked for step 0: the mode switch, the Board colours with a light mode, the data shapes for
  questions and attempts, and the build-plan and DECISIONS updates.
- **App:**
  - A PRELIMS / MAINS switch in the top bar, compact on phones. Prelims lives under `/prelims`;
    every other route is Mains. Each side opens the last page you had open in that mode
    (`atlas-mode-path-*`). Settings belongs to both, so it keeps the mode you came from
    (`atlas-mode`).
  - The sidebar and top bar use the Board look: Nunito and `--bd-*` colours in light and dark,
    with the logo and switch green in Prelims and amber in Mains. Note pages keep the reading
    style. The brand in the sidebar now reads "Atlas".
  - Prelims has its own sidebar (Home for now) and a Home page with the countdown to 23 May 2027
    and a line on what comes next.
- **Data:** `src/lib/practice.ts` holds items, attempts, the eight grades and their FSRS ratings,
  validation, `servable` (no unverified PYQ key, no unchecked generated item) and
  `applyAttemptOp`. Also `src/lib/mode.ts` and `src/lib/exam.ts`. Firestore rules: `items/` is
  owner read-only (the CLI writes it), `attempts/` owner read, create and update but never
  delete, `srs/` owner read and write.
- **Docs:** BUILD_PLAN (M6–M12), DECISIONS, ARCHITECTURE (Practice) and AGENTS (the rating
  exception).
- **Checks** (internal-disk copy): Prettier, `tsc -b`, 86 unit tests, build; `npm run test:cloud`
  23 passed (new: the practice rules); `npx playwright test` 65 passed + 22 skips (installed
  Chrome; new: the switch test at three sizes). Screenshots (fixture):
  `docs/design/practice-foundations/`.
- **Not done:** deploying. It needs the user's go-ahead, and `firebase deploy --only
  firestore:rules` as well as Hosting. Next: M7, the Prelims MCQ loop. It waits on the answer-key
  check running in its own session.

## Sticky notes: heading and text, the rest behind ⋯ — 2026-10-19

- **Branch:** `claude/sticky-menu`, from `main` (4cefbf8). Assisting tool: Claude Code.
- **Why:** the user found the sticky note too busy (quote chip, author and time, reply box,
  six swatches, Unpin and Delete all on the note) and asked for just a heading and the text.
- **Now:** a sticky note shows a heading (the words it's pinned to, small and bold) and its text
  in the marker hand. A faint ⋯ in its corner opens a small menu just below the note: paper
  colour, who wrote it and when, any replies, and Edit, Reply, Unpin, Delete. Edit changes the
  text in place (the existing `edit` thread op). On phones the menu opens inside the note in the
  comments sheet. Other comments, Ask Claude threads and flags are unchanged.
- **Checks:** Prettier, `tsc -b`, 72 unit tests, build; `npx playwright test` 62 passed + 22
  skips (installed Chrome; the sticky test now checks the face holds nothing but heading and
  text, then picks a colour and edits the text through ⋯). Screenshots (fixture):
  `docs/design/sticky-menu/`.
- **Next:** the user reviews the PR; deploying waits for their go-ahead.


## Hosting: app pages no longer cached for an hour — 2026-10-19

- **Branch:** `claude/hosting-no-cache-routes`, from `main` (254f6b3). Assisting tool: Claude Code.
- **Problem (live site, 19 Oct):** `/` and `/notes/P06` came with `cache-control: max-age=3600`,
  `/index.html` with `no-cache`, so a deploy could take up to an hour to show. Why, and the
  rules chosen: DECISIONS (2026-10-19).
- **Change:** `firebase.json` only: two `Cache-Control: no-cache` header rules for app routes.
- **Checks:** cloud build (internal-disk copy). Hosting emulator (firebase-tools 15.34.0),
  `curl -sI`, before → after: `/`, `/notes/P06`, `/gs2/polity`, `/oauth/authorize` none →
  `no-cache`; `/index.html`, `/sw.js`, `/manifest.webmanifest` `no-cache` (unchanged);
  `/assets/index-….js` `public, max-age=31536000, immutable` (unchanged). The globs were also run
  through the emulator's matcher (minimatch) on 24 paths: `/mcp`, `/oauth/register|client|approve|token`,
  `/.well-known/…`, `/assets/…`, `/__/auth/handler` and files with extensions don't match. The
  function paths themselves give 404 in the emulator (functions not emulated).
- **Not done:** deploy. It takes effect on the next Hosting deploy, which needs the user's
  go-ahead. Then `curl -sI https://recall-atlas-511913.web.app/notes/P06` should show
  `cache-control: no-cache`. Browsers that already hold a one-hour copy keep it until it runs
  out, so that first deploy can still take up to an hour to show; later ones show at once.

## Reader polish: sticky notes, sidebar, speed — 2026-10-19

- **Branch:** `claude/reader-polish`, from `main` (b3a030b). Assisting tool: Claude Code.
  **Merged** as PR #44 (be1b68b) and **deployed** to Hosting on 19 Oct (with the user's
  go-ahead; no rule change); the preview channel was cloned from live. Checked signed in on
  the live site: the new build loads, sticky notes use the marker hand, the progress bar and
  sidebar button show, a diagram draws, and the kept copy for the instant start is saved.
- **Sticky notes reopen on touch:** on phones and tablets a highlight opened its note once, and a
  second tap did nothing (BlockNote reacts only when the caret moves into a highlight). A tap on
  any highlight now opens its thread, and closing the panel lets go of it. New e2e test (iPad,
  Android) taps the same sticky twice.
- **Vivid sticky notes:** six paper colours chosen by the note's id, a marker hand (Shantell Sans,
  `@fontsource/shantell-sans`), a folded corner, the author at the foot, a small tilt that
  straightens and lifts on hover or when opened, and a pop-in. The highlighted text takes its
  paper's colour. Dark ink on bright paper in both themes.
- **Collapsible sidebar:** wide screens (over 900 px) get a "Hide sidebar" button and ⌘\ / Ctrl+\;
  it slides away and the page re-centres; "Show sidebar" appears in the top bar. Remembered on the
  device (`atlas-nav`). Phones keep the drawer. New e2e test.
- **Speed:** see DECISIONS (2026-10-19). On the emulators with sign-in and Firestore each slowed
  by 3 s, a reload showed Home in 0.98 s and a note in 0.93 s with the kept copy, against 9.5 s
  without; a note changed by the CLI meanwhile showed the old text at once and the new text when
  Firestore answered; signing out wiped the copy. Diagrams: no ELK download, and a second visit
  draws in 0.55 s instead of 1.05 s (slowed phone CPU). Local page timings are unchanged.
- **Grok Bot's failed review:** Grok's key (`d99d2d20`, "Grok Bot") is valid and was last used
  on 18 Oct at 03:37 UTC. Its later run sent no key: its connector got 401, registered OAuth
  clients ("MCP CLI Proxy", redirect `localhost:12039`) and waited for an interactive approval
  that a scheduled run can't give. Fix on Grok's side: keep the key in the connector settings its
  scheduled tasks use, or mint a new one (`atlas mcp-key add grok`) for the user to paste there.
  Ten never-approved OAuth clients are left over (`atlas oauth list`); harmless.
- **Motion and gestures** (the user's picks, see DECISIONS 2026-10-19):
  - Page transitions: the page glides in and the sidebar stays put; a note's title glides from
    the list into its heading; back and forward replay it; theme switches crossfade.
  - Linked notes: pointing at highlighted text steps its card forward, pointing at a card makes
    its text glow, cards glide to new places, and a tapped note scrolls into view in the panel.
  - Phone gestures: every bottom sheet (Comments, Discuss, Capture, proposals, history, the
    new-comment box) closes when dragged down by its top, with a grab bar; the iPhone/iPad
    home-screen app goes back on a swipe in from the left edge.
  - Sticky colour picker: six swatches on an open sticky note, saved on the thread.
  - Loading shimmer in the page's shape, then a fade-in; press feedback on buttons and cards;
    a thin reading-progress bar at the top of notes and cards.
- **Checks:** Prettier, `tsc -b`, 72 unit tests, build; `npx playwright test` 62 passed + 22
  skips (installed Chrome, internal-disk copy; new tests: tap a sticky twice, fold the sidebar,
  pick a paper colour, drag a sheet closed, the progress bar). The edge swipe needs the
  home-screen app, so it was not tested. Screenshots (fixture): `docs/design/reader-polish/`.
- **Next:** Grok Bot needs a new key in its connector (`atlas mcp-key add grok`, then revoke
  `d99d2d20`) and the new routine prompt; the user is doing this. Hosting serves app routes
  (`/`, `/notes/…`) with a one-hour cache, so a browser can show the old app for up to an hour
  after a deploy; a `no-cache` header for those routes would fix it (done: Hosting entry above).

## Heat map vs the 2025 and 2026 papers — 2026-10-18

- **Branch:** `claude/heatmap-pyq`, stacked on `claude/news-heat-map` (PR #41). Assisting tool: Claude Code.
- **Freeze:** the map was frozen before any paper was opened (`frozenAt` 2026-10-18, notes-repo
  commit e90b278, re-imported into Firestore, pushed).
- **Papers:** Prelims 2025 and 2026 and Mains 2025 from the user's past-paper CSVs in `data/`.
  Mains 2026 (GS1–GS4) and the 2025 and 2026 Essay papers were downloaded from upsc.gov.in (scans),
  then OCRed (tesseract) and transcribed from the page images. 368 questions in all.
- **Matching:** Claude agents matched each question to the frozen map only, with no web access. Only
  news up to the month before each exam counts. Each question is direct, related or none, and
  flagged when it rests on news the map lacks. Private: `research/heatmap/compare/` in the notes repo
  (`analyze.py` → `heatmap-questions.json`, `results.md`; conclusions in `summary.json`).
- **Results:**
  - Questions drawing on the map's news: Prelims 21/100 (2025) and 17/100 (2026); Mains 19/81
    (2025) and 40/87 (2026). GS2 and GS3 carry most of it.
  - Long, loud stories got a question in the next paper 50% of the time, against 17% for any story
    in the news (Mains 70%, Prelims 25%). Brief spikes: 14%.
  - Most linked questions came 3–11 months after their story's peak.
  - Prelims rests on small items the map missed, about 16 per paper.
- **App:**
  - "What UPSC asked" panel: per-paper tiles, a hit-rate table by corner (follows the Coverage /
    Exam weight switch), the peak-to-exam months chart, and the conclusions.
  - Each story card lists its questions (expandable, with the full text).
  - Diamonds on the rivers mark the papers that asked about a story.
  - A "Ring stories UPSC asked about" option on the chart.
  - The story card now scrolls itself to a chosen month without scrolling the page.
- **Data:** `content/heatmap-questions.json`; Firestore `heatmap/questions[-N]`;
  `atlas heatmap-compare-import <file>` checks it against the frozen map. `/api/heatmap` returns
  `{map, comparison}`.
- **Checks:** `npm run check` (71 unit tests, build); `npm run test:cloud` 22 passed; `npx playwright
  test` 53 passed + 16 desktop-only skips (installed Chrome). Screenshots (fixture):
  `docs/design/heatmap-pyq/`.
- **Merged and deployed 2026-10-18** (on the user's say-so): PR #41 (7161149) and #42 (b3a030b) into
  `main`; `firebase deploy --only firestore:rules` and `--only hosting` (firebase-tools 15) from that
  tree. Live checks: the site serves the new bundle and the heat map chunk; signed-out reads of
  `heatmap/current` and `heatmap/questions` return 403; `/mcp` without a key still returns 401.
  Not checked signed in from here (the built-in browser isn't signed in).
- **Not done:** a Prelims items layer (the biggest gap the comparison found).

## News heat map — 2026-10-18

- **Branch:** `claude/news-heat-map`, from `main` (194bb64). Assisting tool: Claude Code.
- **What (user's request):** a month-by-month heat map of news stories from January 2024, built
  without past papers, to compare later with what UPSC asked. The user chose layout C (story
  lifecycles) from three mocks (https://claude.ai/artifact/1d9Ave1Z2bv8h69PGijebA).
- **App:** "News heat map" in the sidebar (`/heat-map`, lazy-loaded `src/heatmap/HeatMapPage.tsx`):
  a chart of months hot against peak (four corners), Coverage / Exam weight switch, area
  filter, the chosen story's month-by-month timeline with sources and Atlas note links, and
  story rivers with Prelims/Mains months marked. Selection is in the URL (replaced, not pushed).
- **Data:** `src/lib/heatmap.ts` (shape, metrics, checks). `content/heatmap.json` locally;
  Firestore `heatmap/current[, current-N]` in parts of ≤300 000 characters; owner read-only
  rule. CLI `atlas heatmap` and `atlas heatmap-import <file> [--force]` (refuses to replace a
  frozen map without `--force`). Export/import carry it.
- **Research (private, `output/heatmap-research/`):** six Claude researchers wrote `raw/YYYY-MM.json`
  (stories with coverage, weight, events and sources; Prelims items). `stories.json` merges thread
  names into stories; `build.py` builds `heatmap.json`, dropping links `linkcheck.py` found dead.
  The shared web-search limit ran out early for every researcher, so most months were sourced
  from Wikipedia's monthly pages, PRS reviews and the links they cite; some events are missing
  (listed in the researchers' reports, kept in `output/heatmap-research/gaps.md`).
- **Result:** 230 stories over 34 months (559 story-months), 289 Prelims items; 1 352 source
  links checked (1 024 opened, ~310 refuse robots, 19 dead and dropped). Longest and loudest:
  Israel–Gaza (28 months hot), Russia–Ukraine (26), Iran's wars and Hormuz (15), the SIR (14),
  monsoon floods, Naxalism and RBI policy (12 each), US tariffs and the space programme (11).
  Imported into Firestore and the mirror; the blind build is notes-repo commit 55fa3f8
  (`research/heatmap/`, not pushed yet). Not frozen: freeze it just before the comparison.
- **Checks:** `npm run check` (69 unit tests, build); `npm run test:cloud` 22 passed (rules:
  owner reads, nobody writes; a map split across parts round-trips); `npx playwright test` 50
  passed + 16 desktop-only skips (run on the installed Chrome, as Playwright's own browsers were
  missing). Screenshots (fixture): `docs/design/heatmap/`.
- **Not done:** deploying the Firestore rule and Hosting (needs the user's say-so); the freeze
  and the comparison with past papers; Grok and Gemini adding to the map.

## Proposals, history and the feed (M4) — 2026-10-18

- **Branch:** `claude/proposals-history-feed`, from `main` (a0b03af). Assisting tool: Claude Code.
- **Proposals:** `src/lib/proposals.ts` (kinds, ops, `applyToBlocks`, `planApproval`),
  `src/lib/approve.ts` (approve and restore over a storage interface). Routes in the dev API
  and the cloud API: `/api/proposals[/c/id]` (ops and `{op: "approve"}`), `/api/history/c/id[/hid]`
  (list, read, restore). Rules: `proposals/{id}` owner-only. Snapshots carry `reason`/`savedAt`.
- **App:** "N changes proposed" bar and review drawer (`src/proposals/Review.tsx`), dashed
  outline on affected blocks, History drawer with a line diff and Restore, inbox section
  "Changes to approve" (counted in the sidebar badge), `?review=1` opens the drawer.
- **CLI:** `proposals`, `propose`, `approve`, `reject`, `history`, `restore`; export/import carry
  proposals.
- **Feed (private repo):** `updater.config.json` reads `content/notes` (the mirror); the matcher
  skips study files; `UPDATER.md` describes the new flow (Claude files `atlas propose --feed`).
- **Scheduled task:** `mains-atlas-twice-daily` now files proposals from confirmed flags and
  from the feed, and never approves.
- **Checks:** `npm run check` (63 unit tests, build); `npm run test:cloud` 20 passed (incl.
  approve, stale and restore through Firestore); `npx playwright test` 47 passed + 16 skips
  (incl. approve → history → restore). Screenshots: `docs/design/proposals/`.
- **Phone toolbar:** the note toolbar (`.doc-actions`) now wraps, and History is icon-only under
  600px. Without that the extra button overflowed on Android and two tests timed out in CI.
- **First real proposals:** the 18 Oct feed run had no honest matches; the four undecided items
  from the 16 Oct digest were re-checked and filed on P10 (five proposals, two marked digest-only).

## Comments, flags and Discuss redesign — 2026-10-17

- **Branch:** `claude/comments-discuss-design`, from `main` (0ac7cc2). Assisting tool: Claude Code.
  The user chose from mockups: direction A for comments and flags, B's paper look for stickies,
  and one layout per Discuss mode.
- **Thread cards** (`src/comments/CommentsUI.tsx`): author avatar (Claude, you, or the AI's own
  mark and colour) and time in the header; kind and severity stamps (✕ Looks wrong, ⟳ Out of
  date, ? No source, ~ Uncertain); Claude's verdict strip on flags ("Claude: Confirmed" / "Not
  supported", read from its reply); a trail Raised → Checked → You decide → Applied (Dismissed
  when Claude found it unsupported); replies threaded under a rail; animated waiting dots.
- **Sticky notes:** paper colour, a pin, a small fixed tilt per note that straightens on hover
  or when opened.
- **Discuss** (`src/discuss/Discuss.tsx`): debate stage (For and Against facing across the
  motion, next speaker ringed), roundtable ring of seats with the next speaker lit and the
  moderator's turns as centred framing cards, devil's-advocate claim card with "Attack n" and
  "Defence n" turns. Rounds are chapter lines ("Round 2 · Rebuttal"). Claude's verdict closes a
  debate; a devil's round ends with "Did the claim hold?" (Holds / Partly / Falls, stored in the
  existing vote). "To note" is now "Save to note". No made-up percentages.
- **Checks:** `npm run check` (56 unit tests, build); `npx playwright test` 43 passed + 14 skips
  (one test updated for the "Save to note" label). Screenshots (fixture, light and dark, three
  sizes): `docs/design/comments-discuss/`.
## Settings page — 2026-10-17

- **Branch:** `claude/settings-page`, from `main` (0ac7cc2). Assisting tool: Claude Code.
- **What (user's request):** the theme button and Sign out left the top bar. A gear
  "Settings" link sits at the foot of the sidebar and opens `/settings`: Appearance (System /
  Light / Dark, per device) and, in the cloud build, Account (email, Sign out, which also clears
  the offline copy). Top bar now: menu, back, forward, breadcrumb, search.
- **Checks:** `npm run check` (56 unit tests, build); `npx playwright test` 43 passed before, plus a new
  Settings test at three sizes; cloud Account section and Sign out checked on the emulators.
- **Screenshots:** `docs/design/settings/`.

## OAuth for the MCP server — 2026-10-17

- **Branch:** `claude/mcp-oauth`, from `main` (089d8c8). Assisting tool: Claude Code.
- **Why:** the Gemini app's custom connected apps and Claude's custom connectors only take an
  address plus OAuth, not a key.
- **Server:** `server/oauth.ts` (metadata, `/oauth/register`, `/oauth/client`,
  `/oauth/approve`, `/oauth/token`, token checks), wired into `mcp/function.ts`; Hosting
  rewrites `/.well-known/**` and those `/oauth/*` paths to the function. `/mcp` 401s carry
  `WWW-Authenticate: Bearer resource_metadata=…`.
- **App:** `/oauth/authorize` consent page (`src/oauth/Consent.tsx`, cloud build only) behind
  the Google sign-in; the owner picks the AI. New AI id `claudeapp` ("Claude app").
- **CLI:** `atlas oauth list | revoke <id>`.
- **Checks:** `npm run check` (56 unit tests, build); `npm run test:cloud` 19 passed (6 new:
  metadata and 401 hint, https-only registration, owner-only approval from the app's origin,
  single-use code with PKCE, MCP call with the token labelled "Claude app", refresh rotation,
  revocation, confidential-client secret). Consent flow driven in the emulator build: sign in,
  approve, back to the app with code and state. Screenshots: `docs/design/oauth/`.
- **Not tested against the real apps yet:** Gemini app and Claude.ai, after deploy. Gemini
  users report OAuth failures in its relay that aren't on the server side.

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
