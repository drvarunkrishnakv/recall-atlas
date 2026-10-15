# Handoff

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
