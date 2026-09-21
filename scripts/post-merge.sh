#!/usr/bin/env bash
set -euo pipefail

# Keep task-agent merges reproducible and non-interactive. Database migrations are
# applied by the deployment pipeline, not against an arbitrary development database.
export COREPACK_ENABLE_PROJECT_SPEC=0
pnpm install --frozen-lockfile --ignore-workspace