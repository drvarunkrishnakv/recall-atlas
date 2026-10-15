# Handoff

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
