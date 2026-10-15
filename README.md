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

M0, a clean start: there is no app code yet. See docs/BUILD_PLAN.md for the milestones
and docs/HANDOFF.md for the current state.

## Privacy

This repository is public and holds only code and docs. Note content lives in Firestore,
readable only by the owner's account, and in a private notes repository. See
docs/ARCHITECTURE.md.

## For agents

Read AGENTS.md first.
