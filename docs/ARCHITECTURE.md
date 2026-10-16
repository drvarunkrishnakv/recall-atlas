# Architecture: Mains Atlas reader

A private, minimal, Notion-like app for living UPSC Mains revision notes. You read
and edit notes in it on a Mac, an Android phone and an iPad. Claude keeps the notes
current from official sources and acts on your comments twice a day.

The visual direction is the **colourful mock** (Evernote-inspired: warm paper ground, a colour
per subject, rounded green action buttons, lavender for Claude): https://claude.ai/artifact/V5VbeLQ3hFE9LAgjf8k5Pe
It replaced Mock A · Paper on 2026-10-16.

## What it does (and nothing more)

- **Navigate:** a short sidebar (Search, Capture, Home, Claude inbox, Revise today, Concept
  cards, subjects), breadcrumbs, and working back/forward. Everything is one click.
- **Home:** subject cards, Continue reading, Due for revision, Claude inbox, Scratch pad.
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

Non-goals: multiple users, live co-editing, an AI chat box, public sharing,
gamification, or any Notion feature we don't use.

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
| Install | PWA (manifest + service worker) | Home-screen app on Android and iPad |

## Content format

Each page (note or card) is **BlockNote block JSON**, the source of truth:
`content/<notes|cards>/<id>.json` = `{id, title, version, updated, …meta, blocks}`.
Atlas adds four schema items: `chart` (JSON spec, drawn as SVG), `flowchart` (Mermaid),
`callout` (note / prelims / warning) and the inline `term` chip (`{kind: card|note, id, label}`).

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

| Collection | Fields |
|---|---|
| `notes/{noteId}` | `title, paper, subject, topic, status (draft/in-review/live), blocks (BlockNote JSON), version, updated` |
| `notes/{noteId}/history/{version}` | Full body snapshot, author, reason |
| `cards/{cardId}` | `kind (case/body/provision/event/concept), title, summary, blocks, version` |
| `comments/{id}` | `page, kind (comment/sticky/claude), anchor {blockId, quote}, resolved, detached, comments [{userId, body, createdAt}]` |
| `proposals/{id}` | `noteId, section, change {find, replace} or {row}, source {title, url, date}, reason, status (pending/approved/rejected/applied)` |

- The syllabus tree (papers, subjects, topics, planned notes) is not private, so it
  ships in the app as JSON.
- "Cited in" lists on cards are derived by scanning note bodies for `[[card-id|…]]`,
  never stored by hand.

## Privacy and security

- This repository is public. It holds **no note content**, no credentials and no source text.
- Firestore rules allow reads and writes only when `request.auth.uid` equals the owner's UID.
- Until Firebase (M3), the Vite dev server's save API writes the files above. Writes are
  accepted only from this Mac (loopback), only from the app's origin, and only with the
  `X-Atlas` header; page ids are validated to block path tricks.
- Claude works through `app/cli/atlas.ts` (list comments, reply, show a page, replace one
  exact phrase). In M3 it moves to the Firebase Admin SDK, with its service-account key
  outside the repo (for example `~/.config/mains-atlas/`).
- The private notes repo (`drvarunkrishnakv/upsc-mains-atlas-notes`) keeps a Markdown
  mirror exported from Firestore, so other agents can read it and git keeps the history.

## How Claude keeps notes current

A scheduled Claude task runs twice a day (morning and evening):

1. Fetch official sources (PIB, PRS, Supreme Court) and match them to note watch profiles.
2. Write real changes as `proposals` (State of play rewrites, new evidence, open checks).
3. Read open comments addressed to Claude, act on them, and reply in the thread.
4. Apply approved proposals, bump versions, and save history.
5. Export the mirror to the private notes repo and push.

Claude never changes a fact without either your approval or your explicit comment asking for it.

## Repository layout (target)

```
app/                 Vite React app (editor, side peek, comments, search)
app/src/editor/      BlockNote schema, page view, one-time Markdown conversion
app/src/comments/    Thread store, anchors, comments UI
app/src/lib/         Pure helpers shared with the server and CLI (Markdown export, threads)
app/server/          Local save API (Vite dev middleware) until Firestore
app/cli/atlas.ts     Node CLI for Claude: comments, replies, page text, exact edits, captures, progress
app/src/dashboard.tsx Home, subject database, Revise today, Claude inbox
app/src/content/     Syllabus tree (public structure only) and the content store
firebase.json        Hosting + Firestore config
firestore.rules      Owner-only rules
docs/                Architecture, build plan, decisions, handoff
```
