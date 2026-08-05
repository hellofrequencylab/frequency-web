import { describe, it, expect } from 'vitest'
import {
  globToRegExp,
  inScope,
  evaluate,
  formatScoreboard,
  formatProvenanceNotes,
  basisFingerprint,
  auditProvenance,
  mergeBaselines,
  loadConfig,
} from './check-adoption.mjs'

// Locks the adoption-debt RATCHET harness (Lift 2a, docs/UX-MATURITY-PLAN.md). countEntry/evaluate are
// the pure functions the CLI runs; feeding them fixture corpora keeps the gate honest without touching
// the filesystem (mirrors scripts/check-elements.test.ts). The real baselines file is also asserted to
// be well-formed, because a silently-broken pattern would make a ratchet read green forever.
//
// The PROVENANCE half (2026-08-04) locks the other failure mode, the one `baseline vs current` is blind
// to: a baseline that was never justified. A blind `--update` once raised raw-button-bg 494 → 529 and
// every class then read green. These tests assert the three rules that make that impossible to repeat —
// a baseline must account for itself, a basis change invalidates the comparison, and a rise is refused
// unless it is explicitly allowed and explained.

const frozen = (value: number, over: Record<string, unknown> = {}) => ({
  at: '2026-08-04',
  value,
  direction: 'seed',
  reason: 'seeded from the verification census',
  ...over,
})

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

describe('check-adoption — provenance: a baseline must account for itself', () => {
  const good = { ...entry, frozen: frozen(2, { basis: basisFingerprint(entry) }) }

  it('passes an entry whose frozen record matches its baseline and its basis', () => {
    expect(auditProvenance([good])).toEqual([])
  })

  it('FAILS a baseline with no provenance at all', () => {
    expect(auditProvenance([entry]).join()).toMatch(/no `frozen` record/)
  })

  it('FAILS a baseline hand-edited away from its frozen value (the laundering move)', () => {
    const tampered = { ...good, baseline: 999 }
    expect(auditProvenance([tampered]).join()).toMatch(/hand-edited without recording why/)
  })

  it('FAILS a raise or rebase whose reason is missing or a shrug', () => {
    const bare = { ...good, frozen: { ...good.frozen, direction: 'raised', reason: 'x' } }
    expect(auditProvenance([bare]).join()).toMatch(/reason must say/)
  })

  it('FAILS when the measurement basis moved under the number, because the two are not comparable', () => {
    // Narrowing the pattern is exactly how an 809-site "shrink" got booked with no sweep behind it.
    const narrowed = { ...good, patterns: ['\\brounded-full\\b'] }
    expect(auditProvenance([narrowed]).join()).toMatch(/measurement basis changed/)
  })

  it('fingerprints the basis over every field that decides what is counted — and nothing else', () => {
    const base = basisFingerprint(entry)
    expect(basisFingerprint({ ...entry, description: 'reworded', baseline: 41 })).toBe(base)
    expect(basisFingerprint({ ...entry, patterns: ['\\brounded-full\\b'] })).not.toBe(base)
    expect(basisFingerprint({ ...entry, include: ['app/**/*.tsx'] })).not.toBe(base)
    expect(basisFingerprint({ ...entry, exclude: [] })).not.toBe(base)
    expect(basisFingerprint({ ...entry, absent: ['\\bEntityCard\\b'] })).not.toBe(base)
    expect(basisFingerprint({ ...entry, mode: 'files' })).not.toBe(base)
  })
})

describe('check-adoption — provenance: the merge is asymmetric', () => {
  const config = () => ({
    entries: [{ ...entry, frozen: frozen(2, { basis: basisFingerprint(entry) }) }],
  })

  it('writes a FALL down, records why, and appends to the history', () => {
    const cfg = config()
    const rows = evaluate(cfg.entries, corpus(['components/a.tsx', 'rounded-lg']))
    const result = mergeBaselines(cfg, rows, { allowRaise: false, reason: 'the radius codemod landed', at: '2026-09-01' })
    expect(result.written).toBe(true)
    expect(cfg.entries[0].baseline).toBe(1)
    expect(cfg.entries[0].frozen).toMatchObject({ at: '2026-09-01', value: 1, from: 2, direction: 'lowered' })
    expect(cfg.entries[0].history).toHaveLength(1)
  })

  it('REFUSES a rise and writes nothing, so a regression cannot be re-frozen into the floor', () => {
    const cfg = config()
    const rows = evaluate(cfg.entries, corpus(['components/a.tsx', 'rounded-lg rounded-md rounded-full']))
    const result = mergeBaselines(cfg, rows, { allowRaise: false, reason: 'ran update after a sweep' })
    expect(result.written).toBe(false)
    expect(result.raised).toEqual([{ key: 'literal-radius', from: 2, to: 3 }])
    expect(cfg.entries[0].baseline).toBe(2)
    expect(cfg.entries[0].history).toBeUndefined()
  })

  it('accepts a FORCED rise, but brands it `raised` with its date and reason forever after', () => {
    const cfg = config()
    const rows = evaluate(cfg.entries, corpus(['components/a.tsx', 'rounded-lg rounded-md rounded-full']))
    const result = mergeBaselines(cfg, rows, { allowRaise: true, reason: 'the class was redefined', at: '2026-09-01' })
    expect(result.written).toBe(true)
    expect(cfg.entries[0].baseline).toBe(3)
    expect(cfg.entries[0].frozen).toMatchObject({ direction: 'raised', from: 2, value: 3, reason: 'the class was redefined' })
  })

  it('re-freezing after a basis change is recorded as `rebased`, so no sweep gets the credit', () => {
    const cfg = config()
    cfg.entries[0].patterns = ['\\brounded-full\\b'] // narrowed → the old number answered another question
    const rows = evaluate(cfg.entries, corpus(['components/a.tsx', 'rounded-lg rounded-full']))
    const result = mergeBaselines(cfg, rows, { allowRaise: false, reason: 'pattern narrowed to the full radius only', at: '2026-09-01' })
    expect(result.written).toBe(true)
    expect(cfg.entries[0].frozen.direction).toBe('rebased')
    expect(cfg.entries[0].frozen.basis).toBe(basisFingerprint(cfg.entries[0]))
  })

  it('leaves an unchanged, still-comparable entry completely alone (no provenance churn)', () => {
    const cfg = config()
    const rows = evaluate(cfg.entries, corpus(['components/a.tsx', 'rounded-lg rounded-full']))
    const result = mergeBaselines(cfg, rows, { allowRaise: false, reason: 'nothing moved this run' })
    expect(result.changed).toEqual([])
    expect(cfg.entries[0].frozen.at).toBe('2026-08-04')
  })
})

describe('check-adoption — provenance: a raised floor stays visible', () => {
  it('flags a class that reads "held" but is standing on a raise, and prints why', () => {
    const raised = {
      ...entry,
      baseline: 2,
      frozen: frozen(2, { direction: 'raised', from: 1, basis: basisFingerprint(entry), reason: 'measured on a different corpus' }),
    }
    const rows = evaluate([raised], corpus(['components/a.tsx', 'rounded-lg rounded-full']))
    expect(rows[0].status).toBe('held')
    expect(rows[0].unearned).toBe(true)
    expect(formatScoreboard(rows)).toContain('raised')
    const notes = formatProvenanceNotes(rows)
    expect(notes).toContain('literal-radius')
    expect(notes).toContain('1 → 2')
    expect(notes).toContain('measured on a different corpus')
  })

  it('says nothing when every baseline was bought by a sweep', () => {
    const swept = { ...entry, frozen: frozen(2, { direction: 'lowered', from: 9, basis: basisFingerprint(entry) }) }
    expect(formatProvenanceNotes(evaluate([swept], corpus(['components/a.tsx', 'rounded-lg rounded-full'])))).toBe('')
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

  it('can account for every shipped baseline — date, direction, basis and reason', () => {
    expect(auditProvenance(config.entries)).toEqual([])
  })

  it('states out loud which shipped baselines were not bought by a sweep', () => {
    // Not an assertion about how many there SHOULD be — an assertion that the file cannot hold a
    // raised or rebased floor without saying so in a sentence a reviewer can check.
    for (const e of config.entries) {
      if (e.frozen.direction === 'raised' || e.frozen.direction === 'rebased') {
        expect(e.frozen.reason.length, `${e.key}: an unearned floor needs its evidence written down`).toBeGreaterThan(80)
        expect(e.frozen.from, `${e.key}: an unearned floor must say what number it replaced`).toEqual(expect.any(Number))
      }
    }
  })
})

describe('check-adoption — the corrected patterns measure what they name', () => {
  const config = loadConfig()
  const pattern = (key: string) => new RegExp(config.entries.find((e: { key: string }) => e.key === key)!.patterns[0], 'g')

  // 🔴 THE BUG. The WCAG 2.5.5 allowlist did not work. The lookahead sat at a `\b`, and
  // `min-h-[44px]` has a SECOND word boundary at its inner `h` — where the lookahead sees only
  // `h-[44px]`, fails to match the allowlist, and lets it through. 12 tap-target floors were
  // counted as debt, so a PR that ADDED a correct 44px target raised the class and failed CI.
  it('raw-px-arbitrary exempts the 44px tap-target floor it says it exempts', () => {
    const re = pattern('raw-px-arbitrary')
    expect('min-h-[44px]'.match(re)).toBeNull()
    expect('min-w-[44px]'.match(re)).toBeNull()
    expect('top-[-9999px]'.match(re)).toBeNull()
  })

  it('raw-px-arbitrary still counts real arbitrary px, including negative utilities', () => {
    const re = pattern('raw-px-arbitrary')
    // Negative utilities are the trap in the FIX: anchoring at a token start with `(?<![-\w])`
    // alone would have silently dropped `-mt-[2px]`, trading one blind spot for another.
    for (const s of ['h-[18px]', 'md:h-[18px]', 'min-h-[180px]', '-mt-[2px]', '-top-[1px]', 'max-w-[180px]']) {
      expect(s.match(re), `${s} should count as raw px`).not.toBeNull()
    }
  })

  it('white-black-literals does not count font-black, which is a font WEIGHT', () => {
    const re = pattern('white-black-literals')
    expect('font-black'.match(re)).toBeNull()
    for (const s of ['text-white', 'bg-black', 'white/50', 'border-black/10']) {
      expect(s.match(re), `${s} is a monochrome literal`).not.toBeNull()
    }
  })

  // The radius sweep retired `rounded-full` in favour of `rounded-pill` — including inside
  // ProgressTrack itself — so this pattern's 0 meant "the class I name no longer exists",
  // not "no bar is hand-rolled".
  it('adhoc-progress catches a pill track, not only the retired full one', () => {
    const re = pattern('adhoc-progress')
    expect('<div className="rounded-pill bg-border"><div style={{ width: `${p}%` }} /></div>'.match(re)).not.toBeNull()
    expect('<div className="rounded-full bg-border"><div style={{ width: `${p}%` }} /></div>'.match(re)).not.toBeNull()
  })

  it('handrolled-icon-button counts an icon-only button and not a text button', () => {
    const re = pattern('handrolled-icon-button')
    const iconOnly = '<button type="button" onClick={() => go()} className="flex h-8 w-8 rounded-lg"><X className="h-4 w-4" /></button>'
    const withText = '<button type="button" onClick={() => go()} className="flex h-8 rounded-lg"><X className="h-4 w-4" />Delete</button>'
    expect(iconOnly.match(re), 'icon-only button should count').not.toBeNull()
    expect(withText.match(re), 'a text button is not an icon button').toBeNull()
  })

  it('raw-palette catches a raw Tailwind palette class and not a semantic role', () => {
    const re = pattern('raw-palette')
    for (const s of ['text-amber-700', 'bg-gray-50', 'shadow-violet-900/30', 'border-yellow-300']) {
      expect(s.match(re), `${s} is a raw palette class`).not.toBeNull()
    }
    for (const s of ['text-primary', 'bg-surface', 'border-border-strong', 'text-on-primary']) {
      expect(s.match(re), `${s} is a semantic role`).toBeNull()
    }
  })
})
