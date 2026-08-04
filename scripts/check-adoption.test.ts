import { describe, it, expect } from 'vitest'
import { globToRegExp, inScope, countEntry, evaluate, formatScoreboard, loadConfig } from './check-adoption.mjs'

// Locks the adoption-debt RATCHET harness (Lift 2a, docs/UX-MATURITY-PLAN.md). countEntry/evaluate are
// the pure functions the CLI runs; feeding them fixture corpora keeps the gate honest without touching
// the filesystem (mirrors scripts/check-elements.test.ts). The real baselines file is also asserted to
// be well-formed, because a silently-broken pattern would make a ratchet read green forever.

const entry = {
  key: 'literal-radius',
  description: 'literal rounded-* instead of the role radii',
  mode: 'matches',
  patterns: ['\\brounded-(?:sm|md|lg|xl|full)\\b'],
  include: ['{app,components}/**/*.tsx'],
  exclude: ['**/*.test.tsx'],
  baseline: 2,
}

const corpus = (...pairs: [string, string][]) => pairs.map(([path, text]) => ({ path, text }))

describe('check-adoption — scope globs', () => {
  it('matches ** across directories and honors brace sets', () => {
    expect(globToRegExp('{app,components}/**/*.tsx').test('components/feed/post-card.tsx')).toBe(true)
    expect(globToRegExp('{app,components}/**/*.tsx').test('app/page.tsx')).toBe(true)
    expect(globToRegExp('{app,components}/**/*.tsx').test('lib/og/card.tsx')).toBe(false)
  })

  it('excludes win over includes', () => {
    expect(inScope('components/x.tsx', entry)).toBe(true)
    expect(inScope('components/x.test.tsx', entry)).toBe(false)
    expect(inScope('test/e2e/x.tsx', entry)).toBe(false)
  })
})

describe('check-adoption — the ratchet', () => {
  it('FAILS when a count rises above baseline', () => {
    const rows = evaluate(
      [entry],
      corpus(['components/a.tsx', '<div className="rounded-lg rounded-full rounded-md" />']),
    )
    expect(rows[0].current).toBe(3)
    expect(rows[0].delta).toBe(1)
    expect(rows[0].status).toBe('risen')
  })

  it('PASSES when a count holds', () => {
    const rows = evaluate([entry], corpus(['components/a.tsx', 'rounded-lg rounded-full']))
    expect(rows[0].status).toBe('held')
    expect(rows[0].delta).toBe(0)
  })

  it('PASSES when a count falls, and reports the shrink', () => {
    const rows = evaluate([entry], corpus(['components/a.tsx', 'rounded-lg']))
    expect(rows[0].current).toBe(1)
    expect(rows[0].delta).toBe(-1)
    expect(rows[0].status).toBe('shrunk')
  })

  it('ignores matches outside the declared scope (debt cannot hide by moving, or be blamed on a test fixture)', () => {
    const rows = evaluate(
      [entry],
      corpus(
        ['components/a.tsx', 'rounded-lg rounded-full'],
        ['components/a.test.tsx', 'rounded-lg rounded-lg rounded-lg'],
        ['lib/og/card.tsx', 'rounded-lg rounded-lg'],
      ),
    )
    expect(rows[0].current).toBe(2)
    expect(rows[0].status).toBe('held')
  })

  it('counts FILES in files mode, and `absent` disqualifies a file that already adopted the kit', () => {
    const files = {
      key: 'bespoke-cards',
      description: 'cards owed to the kit',
      mode: 'files',
      patterns: ['className='],
      absent: ['\\bEntityCard\\b'],
      include: ['components/**/*-card.tsx'],
      baseline: 1,
    }
    const rows = evaluate(
      [files],
      corpus(
        ['components/x-card.tsx', '<div className="p-4" />'],
        ['components/y-card.tsx', 'import { EntityCard } from "@/components/cards/entity-card"\n<EntityCard className="" />'],
        ['components/z-card.tsx', 'export const Z = 1'],
      ),
    )
    expect(rows[0].current).toBe(1)
    expect(rows[0].files).toEqual(['components/x-card.tsx'])
  })

  it('renders a scoreboard that names every class and its delta', () => {
    const out = formatScoreboard(evaluate([entry], corpus(['components/a.tsx', 'rounded-lg'])))
    expect(out).toContain('literal-radius')
    expect(out).toContain('shrank')
  })
})

describe('check-adoption — the shipped baselines file', () => {
  const config = loadConfig()

  it('declares roots and file extensions', () => {
    expect(config.roots.length).toBeGreaterThan(0)
    expect(config.extensions.length).toBeGreaterThan(0)
  })

  it('gives every key a description, a non-empty pattern set, a scope, and a frozen count', () => {
    expect(config.entries.length).toBeGreaterThan(0)
    for (const e of config.entries) {
      expect(e.key, 'entry needs a key').toBeTruthy()
      expect(e.description?.length, `${e.key}: needs a human description`).toBeGreaterThan(10)
      expect(e.patterns?.length, `${e.key}: needs at least one pattern`).toBeGreaterThan(0)
      for (const p of e.patterns) {
        expect(p.length, `${e.key}: empty pattern`).toBeGreaterThan(0)
        expect(() => new RegExp(p, 'g'), `${e.key}: pattern must compile`).not.toThrow()
      }
      expect(e.include?.length, `${e.key}: needs a file scope`).toBeGreaterThan(0)
      expect(['matches', 'files'], `${e.key}: unknown mode`).toContain(e.mode)
      expect(Number.isInteger(e.baseline), `${e.key}: baseline must be a frozen integer`).toBe(true)
      expect(e.baseline, `${e.key}: baseline cannot be negative`).toBeGreaterThanOrEqual(0)
    }
  })

  it('has unique keys (a duplicate would silently shadow a debt class)', () => {
    const keys = config.entries.map((e: { key: string }) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
