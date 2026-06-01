#!/bin/bash
# SessionStart hook: install dependencies so tests, linters, and type
# checks work in Claude Code on the web sessions.
set -euo pipefail

# Only run in the remote (Claude Code on the web) environment. Local
# sessions manage their own dependencies.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Use `npm install` (not `npm ci`) so the resulting node_modules is cached
# with the container and re-runs stay fast and idempotent.
npm install
