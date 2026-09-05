import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// The Community Collective phase gate (ADR-811), proven to FAIL as well as to pass (scan2 L8-02).
//
// It runs from maintenance.yml and nothing else ever executed it. Phase 0 fails on a missing north
// star, but every tripwire is a WALK: a walk over a directory that is not there returns zero hits
// and reads as "✓ the retired lock is only referenced as history". This file spawns the real script
// from fixture repo roots (it reads paths relative to cwd): one clean, one with the retired
// "no tier names" lock planted as live canon, and one too small to vouch for.

const ROOT = process.cwd()
const GUARD = path.join(ROOT, 'scripts/check-collective.mjs')

const fixtures: string[] = []
afterAll(() => {
  for (const d of fixtures) rmSync(d, { recursive: true, force: true })
})

/** A minimal tree that clears Phase 0 and leaves every later phase ⏳ (not started) or ✓. */
function makeTree({ docs = 110, code = 2100 }: { docs?: number; code?: number } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'collective-'))
  fixtures.push(dir)
  const write = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), text)
  }
  write('docs/COMMUNITY-COLLECTIVE-STRATEGY.md', '# Strategy\n')
  write('docs/COMMUNITY-COLLECTIVE-BUILD-PLAN.md', '# Plan\n')
  write('docs/DECISIONS.md', '## ADR-811: Community Collective\n')
  write('docs/NAMING.md', '# Naming\n\nCommunity Collective is the model.\n')
  for (let i = 0; i < docs; i++) write(`docs/ballast-${i}.md`, `# ballast ${i}\n`)
  for (let i = 0; i < code; i++) write(`lib/ballast/b${i}.ts`, `export const b${i} = ${i}\n`)
  return { dir, write }
}

function run(dir: string) {
  const res = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' })
  return { code: res.status ?? -1, out: `${res.stdout}\n${res.stderr}` }
}

describe('check-collective · the clean case is a real pass', () => {
  it('exits 0 and reports what the tripwires walked', () => {
    const { dir } = makeTree()
    const { code, out } = run(dir)
    expect(code, out).toBe(0)
    expect(out).toContain('the retired "no tier names" lock is only referenced as history')
    expect(out).toMatch(/tripwires walked 11\d docs file\(s\) and 2100 code file\(s\)/)
    expect(out).toContain('✓ phase gate: no inconsistencies')
  })
})

describe('check-collective · the planted off-plan reintroduction', () => {
  it('the retired lock asserted as live canon fails and names the file:line', () => {
    const { dir, write } = makeTree()
    write('docs/LIVE-RULES.md', '# Rules\n\nWe keep the no tier names rule on every pricing page.\n')
    const { code, out } = run(dir)
    expect(code).toBe(1)
    expect(out).toContain('"no tier names" asserted as live canon (retired by ADR-811): docs/LIVE-RULES.md:3')
  })

  it('the same words under a superseded banner, or beside "retired", are history and pass', () => {
    const { dir, write } = makeTree()
    write('docs/OLD-PLAN.md', '# Old plan\n\n> Superseded by ADR-811.\n\nWe keep the no tier names rule.\n')
    write('docs/NOTES.md', '# Notes\n\nThe "no tier names" lock was retired.\n')
    const { code, out } = run(dir)
    expect(code, out).toBe(0)
  })

  it('a half-wired tier fails: present on one pricing surface and not the others', () => {
    const { dir, write } = makeTree()
    write('lib/pricing/plans.ts', "export const PLANS = { collective: {} }\n")
    write('lib/pricing/feature-tiers.ts', 'export const TIERS = {}\n')
    write('lib/pricing/settings.ts', 'export const SETTINGS = {}\n')
    const { code, out } = run(dir)
    expect(code).toBe(1)
    expect(out).toContain('tier "collective" is HALF-WIRED')
  })
})

describe('check-collective · the non-triviality floor', () => {
  it('a tree with only the north star is "saw nothing" (exit 2), never a pass', () => {
    const { dir } = makeTree({ docs: 0, code: 0 })
    const { code, out } = run(dir)
    expect(code).toBe(2)
    expect(out).toContain('walked 4 docs file(s) (floor 100) and 0 code file(s) (floor 2000)')
    expect(out).toContain('saw nothing it can vouch for')
  })

  it('a planted violation still wins over the floor: exit 1, not 2', () => {
    const { dir, write } = makeTree({ docs: 0, code: 0 })
    write('docs/LIVE-RULES.md', 'We keep the no tier names rule.\n')
    expect(run(dir).code).toBe(1)
  })
})
