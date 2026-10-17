#!/usr/bin/env bash
# Opens the Atlas MCP server to Grok Bot for a live discussion run: the HTTP server on
# 127.0.0.1:5190 and a Cloudflare quick tunnel to that port only. Prints the address to give
# Grok Bot. Ctrl-C (or killing this script) stops both.
#
#   ATLAS_CONTENT_DIR=../output/notes-pilot/content npm run discuss:serve
#
# A quick tunnel gets a new address each time; a named tunnel on your own domain replaces it later.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ATLAS_CONTENT_DIR:?Set ATLAS_CONTENT_DIR to the content folder of the notes repo}"
command -v cloudflared >/dev/null || { echo "Install cloudflared first: brew install cloudflared" >&2; exit 1; }
[ -f mcp/dist/atlas-mcp.mjs ] || npm run --silent mcp:build

log="$(mktemp -t atlas-tunnel)"
node mcp/dist/atlas-mcp.mjs --http 5190 2>/dev/null &
server=$!
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:5190 >"$log" 2>&1 &
tunnel=$!
trap 'kill $server $tunnel 2>/dev/null; rm -f "$log"; echo "Stopped the tunnel and the server."' EXIT INT TERM

for _ in $(seq 1 30); do
  url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$log" | head -1 || true)
  [ -n "$url" ] && break
  sleep 1
done
[ -n "${url:-}" ] || { echo "The tunnel didn't start; see $log" >&2; exit 1; }
echo "Atlas MCP is open to Grok Bot at: $url/mcp"
echo "Key: app/.atlas-local/mcp-key (paste it into Grok Bot yourself). Ctrl-C to stop."
wait $tunnel
