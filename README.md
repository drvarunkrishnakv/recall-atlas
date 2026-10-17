# Mains Atlas

A private, minimal, Notion-like app for living UPSC Mains revision notes. You read and
edit on a Mac, an Android phone or an iPad; Claude keeps each note current from official
sources and acts on your comments.

- **Home and subjects:** a colourful home (continue reading, due for revision, Claude inbox,
  scratch pad) and a database per subject: notes grouped by topic with status, revision,
  confidence and Claude columns, as a table, board or due list.
- **Capture:** one green button to jot a thought; Claude files it into the right note.
- **Read and edit:** Notion-style pages (BlockNote) with tables, charts, flowcharts and a
  Prelims box. Click a highlighted term to open its concept card in a side peek.
- **Comment:** comments, permanent sticky notes, and "Ask Claude" threads beside the text.
- **Approve (coming):** approve or reject Claude's proposed updates inline.

Design target: the colourful mock (https://claude.ai/artifact/V5VbeLQ3hFE9LAgjf8k5Pe), which replaced Mock A · Paper.

## Status

M3 (on `claude/firebase-m3`): the cloud build signs in with Google and keeps notes in
Firestore, readable offline and installable as a home-screen app. The local build still saves
to files on the Mac for development and tests. See docs/BUILD_PLAN.md and docs/HANDOFF.md.

```sh
cd app && npm ci
npm run dev:fixture # synthetic fixture content (a git-ignored working copy)
npm run dev:notes   # your notes, from ../output/notes-pilot/content (private repo)
npm run dev:cloud   # the cloud build against Firestore (needs app/.env.local)
npm run check && npx playwright test
npm run test:cloud  # Firestore rules and the cloud API, in the Firebase emulators (needs Java)
npm run atlas -- comments --waiting   # Claude's CLI, on Firestore (or files with ATLAS_CONTENT_DIR)
```

## Privacy

This repository is public and holds only code and docs. Note content lives in Firestore,
readable only by the owner's account, and in a private notes repository. See
docs/ARCHITECTURE.md.

## For agents

Read AGENTS.md first.
