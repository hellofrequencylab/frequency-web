// The lint preflight is a fail-safe, so it needs a test that notices it fired (AGENTS.md:
// "Every fail-safe needs a gate that notices it fired"). A guard that silently returns ok for
// every input reads as coverage and is worse than no guard, so both refusal branches carry a
// positive control here alongside the pass case.

import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkLintToolchain } from './preflight-lint.mjs'

const ROOT = join(import.meta.dirname, '..')
const SCRIPT = join(ROOT, 'scripts', 'preflight-lint.mjs')

describe('lint toolchain preflight', () => {
  it('passes when the repo has its own ESLint at the declared major', () => {
    const result = checkLintToolchain({
      cwd: '/repo',
      declaredRange: '^9',
      exists: () => true,
      readVersion: () => '9.39.4',
    })

    expect(result.ok).toBe(true)
  })

  // POSITIVE CONTROL 1 — the worktree case. `git worktree` never inherits node_modules, and
  // `pnpm run` only prepends the CWD's own ./node_modules/.bin, so PATH falls through to a
  // global ESLint of another major that dies inside eslint-plugin-react.
  it('refuses when the directory was never installed', () => {
    const result = checkLintToolchain({
      cwd: '/repo/.claude/worktrees/agent-x',
      declaredRange: '^9',
      exists: () => false,
      readVersion: () => '',
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('not-installed')
    // The message must name the fix and the directory, because the failure it replaces named
    // neither.
    expect(result.message).toContain('pnpm install --frozen-lockfile')
    expect(result.message).toContain('/repo/.claude/worktrees/agent-x')
  })

  // POSITIVE CONTROL 2 — a stale install of the wrong major fails the same confusing way.
  it('refuses when the installed ESLint is a different major than declared', () => {
    const result = checkLintToolchain({
      cwd: '/repo',
      declaredRange: '^9',
      exists: () => true,
      readVersion: () => '10.1.0',
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('major-mismatch')
    expect(result.message).toContain('eslint 10.1.0')
  })

  it('does not trip on a matching major with a newer minor', () => {
    expect(
      checkLintToolchain({
        cwd: '/repo',
        declaredRange: '^9',
        exists: () => true,
        readVersion: () => '9.99.0',
      }).ok,
    ).toBe(true)
  })

  it('stays silent when the installed version cannot be read', () => {
    // Unreadable is not evidence of a mismatch. The bin exists; do not block on a guess.
    expect(
      checkLintToolchain({
        cwd: '/repo',
        declaredRange: '^9',
        exists: () => true,
        readVersion: () => '',
      }).ok,
    ).toBe(true)
  })
})

// SOURCE SHAPE — the guard is only load-bearing if `pnpm lint` actually runs it, and if the
// ESLint result cache the CI workflow caches is actually written. Both are one word in
// package.json, and both were absent before this test existed.
describe('the lint script wiring', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

  it('runs the preflight before ESLint', () => {
    expect(pkg.scripts.prelint).toContain('scripts/preflight-lint.mjs')
  })

  it('writes an ESLint result cache, which the ci.yml lint job restores', () => {
    // .github/workflows/ci.yml has a "Restore ESLint cache" step on `.eslintcache` keyed on
    // eslint.config.mjs + pnpm-lock.yaml. Without --cache that step restores and saves nothing.
    expect(pkg.scripts.lint).toContain('--cache')
    // The workflow's own comment: a fresh checkout resets every mtime, so the default
    // metadata strategy can never hit in CI. Content hashing is the strategy that works there.
    expect(pkg.scripts.lint).toContain('--cache-strategy content')
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
    expect(ci).toContain('.eslintcache')
  })

  it('still fails on the first warning', () => {
    // The point of the gate. Caching may not become a way to spend the warning budget.
    expect(pkg.scripts.lint).toContain('--max-warnings=0')
  })
})

// THE GUARD ACTUALLY RUNS AS A PROCESS. Everything above tests the pure function and the wiring
// string; neither notices if the script's "am I the entry point?" branch stops matching, which
// would make prelint exit 0 without checking anything. Spawn it for real, in both directions.
describe('preflight-lint.mjs as a process', () => {
  function runIn(dir: string) {
    return spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' })
  }

  it('exits 1 and explains itself in a directory with no install', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preflight-lint-bare-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { eslint: '^9' } }))

    const run = runIn(dir)

    expect(run.status).toBe(1)
    expect(run.stderr).toContain('pnpm install --frozen-lockfile')
  })

  it('exits 0 in a directory that has its own ESLint at the declared major', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preflight-lint-ok-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { eslint: '^9' } }))
    mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', '.bin', 'eslint'), '')
    mkdirSync(join(dir, 'node_modules', 'eslint'), { recursive: true })
    writeFileSync(
      join(dir, 'node_modules', 'eslint', 'package.json'),
      JSON.stringify({ version: '9.39.4' }),
    )

    const run = runIn(dir)

    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
  })

  it('exits 0 in this repo, so the gate it fronts is reachable', () => {
    expect(runIn(ROOT).status).toBe(0)
  })
})
