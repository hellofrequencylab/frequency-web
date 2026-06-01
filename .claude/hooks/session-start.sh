#!/bin/bash
# SessionStart hook: install dependencies so tests, linters, and type-checks
# work in Claude Code on the web sessions. Synchronous by design — the session
# waits until deps are ready, avoiding races where Claude runs tooling too early.
set -euo pipefail

# Only run in the remote (Claude Code on the web) environment. Local sessions
# manage their own node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Idempotent: npm install is safe to re-run and benefits from the cached
# container state (preferred over `npm ci`, which wipes node_modules each time).
npm install
