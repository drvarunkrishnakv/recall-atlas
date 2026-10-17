# Decisions

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
