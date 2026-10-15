# Mains Atlas

A private, minimal, Notion-like app for living UPSC Mains revision notes. You read and
edit on a Mac, an Android phone or an iPad; Claude keeps each note current from official
sources and acts on your comments.

- **Navigate:** GS paper → subject → syllabus topic → note, in one click, with working back.
- **Read:** calm reading pages with tables, charts and flowcharts. Hover a highlighted term
  to see its concept card in place.
- **Edit, comment, approve:** edit like Notion, comment for Claude, and approve or reject
  Claude's proposed updates inline.

Design target: Mock A · Paper (https://claude.ai/artifact/5L2N2GLe9zD74En3PBBdWU).

## Status

M1: the reader runs locally (`app/`). Sign-in, hosting, editing and comments come in M2–M4.
See docs/BUILD_PLAN.md and docs/HANDOFF.md.

```sh
cd app && npm ci
npm run dev         # synthetic fixture content
npm run dev:notes   # your notes, from ../output/notes-pilot/content (private repo)
npm run check && npx playwright test
```

## Privacy

This repository is public and holds only code and docs. Note content lives in Firestore,
readable only by the owner's account, and in a private notes repository. See
docs/ARCHITECTURE.md.

## For agents

Read AGENTS.md first.
