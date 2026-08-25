#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE LIST OF PATHS THAT CAN MOVE PIXELS, read from e2e.yml rather than copied.
//
// `pr-compare` is a REQUIRED status context (ruleset 17640795) and it is posted by the `e2e`
// workflow, which is path-filtered. A pull request that touches none of those paths never triggers
// the workflow, so the context is never posted — and GitHub shows a required-but-never-posted
// context as "Expected — Waiting for status to be reported" and blocks the merge FOREVER.
//
// PR #2107 (two files, both under docs/) hit exactly that and could not merge by any means:
// `bypass_actors` is null on the ruleset, so not even an admin could force it through.
//
// `.github/workflows/pr-compare-fallback.yml` closes it by posting `pr-compare` itself for the
// PRs e2e deliberately skips. That is only honest if it uses the SAME path list e2e uses — so it
// reads the list out of e2e.yml instead of restating it. A second copy would drift, and the drift
// would be silent in the direction that matters: a path dropped from this copy means a
// pixel-moving PR gets a free green.
//
// 🔴 WHY THIS THROWS INSTEAD OF RETURNING []. If the parse silently returned an empty list, then
// NO changed file would ever match, the fallback would post green on EVERY pull request, and it
// would do so alongside e2e's own real result. Two statuses share the name `pr-compare`, the
// latest one wins, and a RED visual gate would be overwritten by a stub that tested nothing. That
// is the exact "vacuous green" failure e2e.yml's preflight job exists to prevent, reintroduced one
// file over. An unparseable e2e.yml is a broken build, not an empty list.
// ─────────────────────────────────────────────────────────────────────────────
import path from 'node:path'
import { workflowPaths, anyMatch, matches, runCli } from './workflow-paths.mjs'

// ⚠️ THE PARSER AND THE MATCHER NOW LIVE IN scripts/workflow-paths.mjs, and this file is a thin
// caller. When `db-tests` needed the same fallback (OWN-038), the choice was to copy this parser or
// to share it — and copying would have reproduced, one file over, the exact hazard this file's
// header is written about: two glob matchers that can disagree. The behaviour here is unchanged;
// scripts/pixel-paths.test.ts spawns this exact command line and still asserts every exit code.

const E2E = path.join(process.cwd(), '.github', 'workflows', 'e2e.yml')

/** The `on.pull_request.paths:` globs from e2e.yml, in file order. Throws if it cannot find them. */
export function pixelPaths() {
  return workflowPaths(E2E, 'pixel-paths')
}

/** Does any changed file match the e2e filter? `files` is a list of repo-relative paths. */
export function movesPixels(files, globs = pixelPaths()) {
  return anyMatch(files, globs)
}

export { matches }

if (import.meta.url === `file://${process.argv[1]}`) {
  // Exit 0 = e2e will run and post pr-compare itself. Exit 1 = it will not, so the fallback must.
  runCli(process.argv.slice(2), pixelPaths(), 'pixel-paths')
}
