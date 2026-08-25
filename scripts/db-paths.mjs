#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE LIST OF PATHS THAT CAN CHANGE THE DATABASE, read from db-tests.yml rather than copied.
//
// `db-tests` is the only gate in CI that applies EVERY migration to an empty database, so it is the
// only one that can see a fresh-apply defect. On 2026-08-25 it caught one that `checks`, `lint`,
// `test` and `analyze` all passed: a migration positive control asserting a grant that exists in
// production and in no fresh apply (ADR-1150). That is the argument for making it REQUIRED (OWN-038).
//
// 🔴 AND MAKING IT REQUIRED IS WHAT CREATES THE DEADLOCK THIS SCRIPT EXISTS TO CLOSE. db-tests.yml
// is path-filtered to supabase/**. A pull request touching none of those paths never triggers the
// workflow, so the context is never posted — and GitHub renders a required-but-never-posted context
// as "Expected — Waiting for status to be reported" and blocks the merge FOREVER. Not slowly. Not
// until a retry. Forever. PR #2107 hit exactly that shape with `pr-compare` on 2026-08-12 and could
// not be merged by any means, because `bypass_actors` is null on ruleset 17640795 — rulesets do not
// exempt repo admins either.
//
// `.github/workflows/db-tests-fallback.yml` closes it by posting `db-tests` for the PRs the real
// workflow deliberately skips. That is only honest if it uses the SAME path list — so it reads the
// list out of db-tests.yml instead of restating it, through the shared parser in
// scripts/workflow-paths.mjs. A second copy would drift, and it would drift silently in the
// direction that matters: a path missing from the copy means a MIGRATION-TOUCHING pull request gets
// a free green on the one gate that could have caught it.
//
// ⚠️ WHY THIS IS NOT A VACUOUS GREEN. The claim the fallback makes is narrow and true: a pull
// request that changes no migration, no pgTAP test and not the workflow itself cannot change what a
// fresh apply produces. The status text says so, so nobody reads it as "the migration suite passed".
// ─────────────────────────────────────────────────────────────────────────────
import path from 'node:path'
import { workflowPaths, anyMatch, runCli } from './workflow-paths.mjs'

const DB_TESTS = path.join(process.cwd(), '.github', 'workflows', 'db-tests.yml')

/** The `on.pull_request.paths:` globs from db-tests.yml, in file order. Throws if absent. */
export function dbPaths() {
  return workflowPaths(DB_TESTS, 'db-paths')
}

/** Does any changed file match the db-tests filter? `files` is a list of repo-relative paths. */
export function touchesDb(files, globs = dbPaths()) {
  return anyMatch(files, globs)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Exit 0 = db-tests will run and post its own check. Exit 1 = it will not, so the fallback must.
  // Do not reintroduce a wrapper (xargs, a pipeline, a subshell) between this and the caller.
  runCli(process.argv.slice(2), dbPaths(), 'db-paths')
}
