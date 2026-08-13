import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pixelPaths, movesPixels } from './pixel-paths.mjs'

// ── The guard on the fallback that unblocks docs-only pull requests ─────────────────────────
//
// `pr-compare` is a REQUIRED status context posted by the path-filtered `e2e` workflow. A pull
// request touching none of those paths never triggers it, so the context is never posted, and
// GitHub blocks the merge forever. `.github/workflows/pr-compare-fallback.yml` posts it for
// exactly those PRs, using the path list read out of e2e.yml by scripts/pixel-paths.mjs.
//
// 🔴 THE FAILURE THIS FILE EXISTS FOR. If the parse ever returns an empty list, NO changed file
// matches, and the fallback posts `pr-compare: success` on EVERY pull request — including ones
// that move pixels, where e2e is ALSO posting its own real verdict. Two statuses share the name,
// the later one wins, and a RED visual gate gets overwritten by a stub that tested nothing.
//
// That is the same "a job that tested nothing reports success" failure e2e.yml's `preflight` job
// was built to prevent, one file over. The parse throwing is the mitigation; these tests are what
// notice if someone makes it lenient.

describe('the e2e path list is read, not restated', () => {
  it('parses every glob out of e2e.yml', () => {
    const globs = pixelPaths()
    // Non-triviality control. An empty or near-empty parse is the dangerous state, so assert a
    // real floor rather than just `toBeTruthy()`.
    expect(globs.length).toBeGreaterThanOrEqual(10)
    expect(globs).toContain('app/**')
    expect(globs).toContain('components/**')
    expect(globs).toContain('lib/**')
    // 🔴 proxy.ts is at the repo ROOT and matched none of the directory globs for a long time.
    // e2e.yml's own comment records that a PR walling or unwalling a route therefore got no run.
    // If it falls out of the parse, that regression comes back silently.
    expect(globs).toContain('proxy.ts')
  })

  it('every parsed glob is a real line in e2e.yml, so the parser cannot invent one', () => {
    const src = readFileSync('.github/workflows/e2e.yml', 'utf8')
    for (const g of pixelPaths()) expect(src).toContain(`- '${g}'`)
  })
})

describe('the fallback fires on exactly the PRs e2e skips', () => {
  it('a docs-only PR does not move pixels, so the fallback must post', () => {
    expect(movesPixels(['docs/DECISIONS.md', 'docs/EDITOR-ARCHITECTURE.md'])).toBe(false)
  })

  it('a migrations-only or scripts-only PR is the same case', () => {
    expect(movesPixels(['supabase/migrations/20270226000100_x.sql'])).toBe(false)
    expect(movesPixels(['scripts/check-adr.mjs'])).toBe(false)
  })

  // 🔴 THE ONE THAT MATTERS. GitHub's `paths-ignore` fires when ANY changed file falls outside the
  // list, so the obvious implementation — a second workflow with the inverted filter — would run
  // on this PR AND e2e would run on it, producing two `pr-compare` check runs. This asserts the
  // mixed case is classified as "e2e owns it", which is what keeps the two from both speaking.
  it('a PR touching docs AND app is owned by e2e, not the fallback', () => {
    expect(movesPixels(['docs/x.md', 'app/(main)/page.tsx'])).toBe(true)
  })

  it('a root-level file in the list is matched exactly, not by prefix', () => {
    expect(movesPixels(['proxy.ts'])).toBe(true)
    // `proxy.ts.bak` must NOT match `proxy.ts` — a prefix match here would hand e2e ownership of
    // PRs it will not actually run on, which deadlocks them again.
    expect(movesPixels(['proxy.ts.bak'])).toBe(false)
  })

  it('a directory glob matches inside the directory and not a same-prefixed sibling', () => {
    expect(movesPixels(['lib/og/deliver.ts'])).toBe(true)
    expect(movesPixels(['library/thing.ts'])).toBe(false)
  })

  it('an empty changed-file list does not move pixels', () => {
    expect(movesPixels([])).toBe(false)
  })
})

// ── The half these tests used to miss: the EXIT CODE the workflow reads ─────────────────────────
//
// 🔴 Everything above tests `movesPixels`, which was always correct. The fallback still failed on
// every docs-only pull request, because the workflow ran the script through `xargs` — and xargs
// reports **123** for any command exiting 1–125. The script's "nothing moves pixels" exit 1 reached
// the workflow as 123, hit its "refusing to post a status on a guess" arm, and failed the job. The
// deadlock the whole fallback exists to close therefore stayed shut, silently, from the day it
// shipped until PR #2116 became the first docs-only PR to run it.
//
// That is AGENTS.md's deploy-safety rule 6 exactly — *every fail-safe needs a gate that notices it
// fired*. The fail-safe had unit tests on its logic and none on its wiring. These are the wiring.

function runCli(files: string[]): number {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-paths-'))
  const list = join(dir, 'changed.txt')
  writeFileSync(list, files.join('\n') + (files.length ? '\n' : ''))
  // Deliberately the workflow's own command line, verbatim. A test that called the function
  // instead would have passed all along.
  const r = spawnSync('node', ['scripts/pixel-paths.mjs', '--files', list], { cwd: process.cwd() })
  return r.status ?? -1
}

describe('the command line the workflow actually runs', () => {
  it('exits 1 on a docs-only list, so the fallback posts pr-compare', () => {
    expect(runCli(['docs/DECISIONS.md', 'docs/CIRCLES-C3-PLAN.md'])).toBe(1)
  })

  it('exits 0 when a changed file can move pixels, so e2e keeps ownership', () => {
    expect(runCli(['docs/x.md', 'app/(main)/page.tsx'])).toBe(0)
  })

  it('exits 1 on an empty list rather than printing the globs and exiting 0', () => {
    // `--files` on an empty file is a real answer about a real PR, not the bare no-argument
    // affordance. Reading it as "e2e owns this" would deadlock a PR that changed nothing.
    expect(runCli([])).toBe(1)
  })

  it('is never 123 — the code xargs substitutes for anything in 1..125', () => {
    for (const files of [['docs/a.md'], [], ['scripts/check-adr.mjs']]) {
      expect(runCli(files)).not.toBe(123)
    }
  })
})
