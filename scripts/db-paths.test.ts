// The db-tests fallback's decision, tested the way pixel-paths.test.ts tests its sibling: by
// SPAWNING the exact command line the workflow runs, so an exit code the workflow depends on cannot
// drift from what this file asserts.
//
// 🔴 WHY THE EXIT CODES ARE THE ASSERTION AND NOT AN IMPLEMENTATION DETAIL. `db-tests` is a REQUIRED
// context (ruleset 17640795, flipped by the owner 2026-08-25 — OWN-038). A required context that is
// never posted blocks the merge FOREVER, so exit 1 — "db-tests did not run, post it on its behalf" —
// is the arm that keeps every no-migration PR mergeable. The pr-compare fallback shipped once with
// that arm UNREACHABLE (an `xargs` wrapper turned exit 1 into 123) and nothing noticed until the
// first docs-only PR after it landed.

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { dbPaths, touchesDb } from './db-paths.mjs'

const REPO = join(__dirname, '..')

/** Spawn the exact command line .github/workflows/db-tests-fallback.yml runs. */
function run(files: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'db-paths-'))
  const list = join(dir, 'changed.txt')
  writeFileSync(list, files.join('\n') + (files.length ? '\n' : ''))
  return spawnSync('node', ['scripts/db-paths.mjs', '--files', list], { cwd: REPO, encoding: 'utf8' })
}

describe('dbPaths', () => {
  it('reads the globs out of db-tests.yml rather than restating them', () => {
    const globs = dbPaths()
    expect(globs).toContain('supabase/migrations/**')
    expect(globs).toContain('supabase/tests/**')
    expect(globs).toContain('.github/workflows/db-tests.yml')
  })

  it('never returns an empty list', () => {
    // An empty list would match nothing, so the fallback would post green on EVERY pull request —
    // including one that changes a migration — overwriting db-tests' real verdict.
    expect(dbPaths().length).toBeGreaterThan(0)
  })
})

describe('touchesDb', () => {
  it('matches a migration, a pgTAP test, and the workflow itself', () => {
    expect(touchesDb(['supabase/migrations/20270101000000_x.sql'])).toBe(true)
    expect(touchesDb(['supabase/tests/rls.test.sql'])).toBe(true)
    expect(touchesDb(['.github/workflows/db-tests.yml'])).toBe(true)
  })

  it('does not match a file that cannot change a fresh apply', () => {
    expect(touchesDb(['docs/DECISIONS.md'])).toBe(false)
    expect(touchesDb(['app/(main)/feed/page.tsx'])).toBe(false)
    // Adjacent but NOT filtered: supabase/config.toml and the edge functions are outside the list.
    expect(touchesDb(['supabase/config.toml'])).toBe(false)
  })

  it('a MIXED pull request belongs to db-tests, not to the fallback', () => {
    // Both must never speak. GitHub keeps the latest status under a shared context name, so if the
    // fallback posted here it could overwrite a RED migration gate with a stub that applied nothing.
    expect(touchesDb(['docs/x.md', 'supabase/migrations/y.sql'])).toBe(true)
  })
})

describe('the command line the workflow actually runs', () => {
  it('exits 0 when db-tests owns the PR, so the fallback posts nothing', () => {
    expect(run(['supabase/migrations/x.sql']).status).toBe(0)
  })

  it('exits 1 when db-tests was skipped, so the fallback posts', () => {
    // 🔴 THE ARM THAT KEEPS EVERY NO-MIGRATION PR MERGEABLE. If this ever returns 123, an `xargs`
    // wrapper has crept back into the workflow and the fallback is dead on exactly the PRs it exists
    // for — which is how the pr-compare fallback shipped broken.
    expect(run(['docs/x.md']).status).toBe(1)
  })

  it('exits 1 on an EMPTY --files list rather than printing the globs', () => {
    // A PR that changes nothing is a real answer about a real PR, not the bare human affordance.
    // Exit 0 here would read as "db-tests owns this PR" and deadlock it.
    expect(run([]).status).toBe(1)
  })

  it('never exits with a code the workflow refuses to interpret', () => {
    for (const files of [['supabase/migrations/x.sql'], ['docs/x.md'], []]) {
      expect([0, 1]).toContain(run(files).status)
    }
  })
})
