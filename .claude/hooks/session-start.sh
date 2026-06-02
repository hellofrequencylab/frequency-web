#!/usr/bin/env bash
# SessionStart hook: prepare a fresh web/container workspace so tests, lint, and
# build work before Claude starts editing.
#
# Web sessions clone the repo fresh into an ephemeral container, so node_modules
# is usually missing. This installs deps once (only when needed) and prints the
# commands available for this repo. Non-blocking: always exits 0.
set -uo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root" || exit 0

echo "🌐 Frequency web — $(node -v 2>/dev/null || echo 'node?') · branch $(git branch --show-current 2>/dev/null)"

# Enable pnpm via corepack if the binary isn't on PATH.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies (node_modules missing)…"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile >/tmp/freq-install.log 2>&1 \
      || pnpm install >/tmp/freq-install.log 2>&1 \
      || { echo "⚠️  pnpm install failed — see /tmp/freq-install.log"; tail -5 /tmp/freq-install.log; }
  else
    echo "⚠️  pnpm not found and corepack enable failed — install deps manually."
  fi
else
  echo "📦 node_modules present — skipping install."
fi

cat <<'NOTE'
Commands: pnpm dev · pnpm build · pnpm lint · pnpm test (vitest)
This is NOT the Next.js in training data — read node_modules/next/dist/docs/ before
writing Next.js code (see AGENTS.md).
Docs protocol on Stop (.claude/hooks/docs-drift-check.sh): technical → git docs/;
instructional → Notion training DB. Spec: docs/DOCS-PROTOCOL.md.
NOTE
exit 0
