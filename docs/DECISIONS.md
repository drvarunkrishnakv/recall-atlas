# Decisions

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
