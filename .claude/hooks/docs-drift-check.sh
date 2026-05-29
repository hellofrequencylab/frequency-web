#!/usr/bin/env bash
# Stop hook: nudge when code is shipped without a corresponding doc update.
# Silent unless drift is detected. Never blocks (always exits 0).
# Pairs with the /sync-docs skill and docs/DOCS-PROTOCOL.md.
#
# Drift = a file set that touches CODE but not DOCS. Evaluated independently for
# (a) the latest commit and (b) the working tree, so a code-only commit is caught
# even when the branch already contains unrelated doc commits.

set -uo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0

CODE_RE='^(app|lib|components|supabase/migrations)/'
DOCS_RE='^(docs/|ROADMAP\.md|README\.md|SEO-AEO-PLAN\.md|AGENTS\.md)'

# Returns 0 (drift) if the given newline-separated file list has code but no docs.
has_drift() {
  local list="$1" code docs
  code="$(printf '%s\n' "$list" | grep -E "$CODE_RE" || true)"
  docs="$(printf '%s\n' "$list" | grep -E "$DOCS_RE" || true)"
  [ -n "$code" ] && [ -z "$docs" ]
}

# (a) latest commit's files (empty if no commits yet)
head_files="$(git show --name-only --format= HEAD 2>/dev/null | sed '/^$/d' || true)"
# (b) working tree (staged + unstaged + untracked)
work_files="$(git status --porcelain 2>/dev/null | awk '{print $NF}' || true)"

drift=0
has_drift "$head_files" && drift=1
has_drift "$work_files" && drift=1

if [ "$drift" -eq 1 ]; then
  echo "📝 Docs drift: code changed (app/ | lib/ | components/ | supabase/migrations/) without a matching docs update."
  echo "   Run /sync-docs — technical docs → git (docs/, DECISIONS.md, ROADMAP.md); instructional docs → the Notion training DB. Spec: docs/DOCS-PROTOCOL.md."
fi

exit 0
