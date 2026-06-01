#!/bin/bash
set -euo pipefail

# SessionStart hook for Claude Code on the web.
# Installs Node dependencies so tests and linters work in remote sessions.

# Only run in the remote (web) environment; local sessions manage their own deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# npm install is idempotent and benefits from the cached container state.
npm install
