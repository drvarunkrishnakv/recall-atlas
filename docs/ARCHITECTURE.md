# Architecture: Mains Atlas reader

A private, minimal, Notion-like app for living UPSC Mains revision notes. You read
and edit notes in it on a Mac, an Android phone and an iPad. Claude keeps the notes
current from official sources and acts on your comments twice a day.

The visual direction is **Mock A · Paper**:
https://claude.ai/artifact/5L2N2GLe9zD74En3PBBdWU

## What it does (and nothing more)

- **Navigate:** a sidebar tree (GS paper → subject → syllabus topic → note),
  breadcrumbs, and working back/forward. Everything is one click.
- **Read:** headings, tables, callouts, charts and flowcharts in a calm reading column.
  Hovering (or tapping) a highlighted term opens its concept card in place.
- **Edit:** click Edit to change the note directly, like Notion. Saves are versioned.
- **Comment:** select text and comment; mark it for Claude. Claude replies in the thread.
- **Approve:** Claude's proposed updates appear inline with ✓ Approve / ✗ Reject.

Non-goals: multiple users, live co-editing, an AI chat box, public sharing,
gamification, or any Notion feature we don't use.

## Stack

| Part | Choice | Why |
|---|---|---|
| App | Vite + React + TypeScript | Small, fast, familiar |
| Routing | React Router, history mode | Real URLs; back/forward work; Hosting rewrites to `index.html` |
| Editor | **Spike in M4:** Milkdown Crepe vs TipTap | Both are ProseMirror-based and MIT. Milkdown is Markdown-native, which suits git and Claude's edits; TipTap is more widely used. The spike decides on our three needs: card terms, chart/diagram blocks, and a clean Markdown round trip. |
| Read view | Markdown rendered with the same extensions as the editor | One format everywhere |
| Charts | Small SVG renderer from JSON rows (as in the mock) | No heavy charting library |
| Diagrams | Mermaid, lazy-loaded | Flowcharts as text that Claude can write and diff |
| Hosting | Firebase Hosting | You already use Firebase |
| Sign-in | Firebase Auth, Google | Only your account can open the app |
| Data | Cloud Firestore with offline persistence | Works on all devices; readable offline |
| Install | PWA (manifest + service worker) | Home-screen app on Android and iPad |

## Content format

Each note's body is **Markdown** with three small extensions:

- `[[card-id|label]]`: a concept-card term (hover card, link to the card page).
- ```` ```chart ```` with a JSON spec (rows, axes, reference lines, title): rendered as SVG.
- ```` ```mermaid ````: flowcharts and timelines.

Markdown keeps notes diffable, readable by other agents and easy for Claude to patch.

## Data model (Firestore)

| Collection | Fields |
|---|---|
| `notes/{noteId}` | `title, paper, subject, topicId, status (draft/in-review/live), body (Markdown), version, updatedAt, updatedBy` |
| `notes/{noteId}/history/{version}` | Full body snapshot, author, reason |
| `cards/{cardId}` | `kind (case/body/provision/event), title, summary, body (Markdown), version` |
| `comments/{id}` | `noteId, anchor {section, quote}, toClaude, status (open/resolved), thread [{by, text, at}]` |
| `proposals/{id}` | `noteId, section, change {find, replace} or {row}, source {title, url, date}, reason, status (pending/approved/rejected/applied)` |

- The syllabus tree (papers, subjects, topics, planned notes) is not private, so it
  ships in the app as JSON.
- "Cited in" lists on cards are derived by scanning note bodies for `[[card-id|…]]`,
  never stored by hand.

## Privacy and security

- This repository is public. It holds **no note content**, no credentials and no source text.
- Firestore rules allow reads and writes only when `request.auth.uid` equals the owner's UID.
- Claude works through a small command-line tool that uses the Firebase Admin SDK. Its
  service-account key lives outside the repo (for example `~/.config/mains-atlas/`).
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
app/                 Vite React app (reader, editor, comments, proposals)
app/src/content/     Syllabus tree JSON (public structure only)
tools/atlas-cli/     Node CLI for Claude: notes, cards, comments, proposals, export
firebase.json        Hosting + Firestore config
firestore.rules      Owner-only rules
docs/                Architecture, build plan, decisions, handoff
```
