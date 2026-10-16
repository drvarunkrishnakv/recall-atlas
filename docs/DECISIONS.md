# Decisions

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
