#!/usr/bin/env bash
# Fails if the public repository tracks private content, secrets or personal paths.
# Runs in CI as the `quality` check and locally with: bash tooling/check-public.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail=0
report() { echo "✗ $1"; fail=1; }

files=$(git ls-files)
self="tooling/check-public.sh"

# 1. Private folders and files that must never be tracked.
blocked=$(echo "$files" | grep -E '^(data|config|scripts|output|docs/private|docs/upstream)/|corpus_snapshot_manifest\.json$|\.sqlite[0-9]*$|(^|/)\.env(\.|$)|service-account.*\.json$|firebase-adminsdk.*\.json$|\.firebaserc$' | grep -v '\.env\.example$' || true)
[ -n "$blocked" ] && report "private paths are tracked:"$'\n'"$blocked"

# 2. Secrets and keys in tracked text files (this script holds the patterns, so it is skipped).
secret_re='-----BEGIN ([A-Z]+ )?PRIVATE KEY-----|"private_key"[[:space:]]*:|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{36}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,}|xox[baprs]-[A-Za-z0-9-]{10,}'
hits=$(echo "$files" | grep -vx "$self" | tr '\n' '\0' | xargs -0 grep -IlE -- "$secret_re" 2>/dev/null || true)
[ -n "$hits" ] && report "possible secrets in:"$'\n'"$hits"

# 3. Personal machine paths.
path_re='/Users/[A-Za-z]|/Volumes/[A-Za-z]|/home/[a-z]+/'
hits=$(echo "$files" | grep -vx "$self" | tr '\n' '\0' | xargs -0 grep -IlE -- "$path_re" 2>/dev/null || true)
[ -n "$hits" ] && report "personal paths in:"$'\n'"$hits"

# 4. Large files (notes, PDFs or datasets do not belong here).
big=$(echo "$files" | while read -r f; do [ -f "$f" ] && [ "$(wc -c < "$f")" -gt 1048576 ] && echo "$f"; done || true)
[ -n "$big" ] && report "files over 1 MB:"$'\n'"$big"

if [ "$fail" -eq 0 ]; then echo "✓ public-repo check passed ($(echo "$files" | wc -l | tr -d ' ') tracked files)"; fi
exit "$fail"
