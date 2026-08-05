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

  it('does NOT flag a rebased floor of ZERO — there is no debt standing on it', () => {
    // The warning means "debt the ratchet stopped guarding". At baseline 0 it guards everything:
    // the next site added fails CI. literal-type and raw-palette were both flagged forever for a
    // fingerprint change alone, padding the block that literal-display-type's 204-site gap was
    // hiding inside. A warning listing classes with no debt in them is how the real one gets missed.
    const zero = {
      ...entry,
      baseline: 0,
      patterns: ['\\bnothing-matches-this\\b'],
      frozen: frozen(0, { direction: 'rebased', from: 0, reason: 'the corpus basis moved; the count was already 0' }),
    }
    zero.frozen.basis = basisFingerprint(zero)
    const rows = evaluate([zero], corpus(['components/a.tsx', 'rounded-lg']))
    expect(rows[0].current).toBe(0)
    expect(rows[0].unearned).toBe(false)
    expect(formatProvenanceNotes(rows)).toBe('')
    // …but one site of real debt under the same rebase IS named.
    const nonZero = { ...zero, baseline: 1, patterns: ['\\brounded-lg\\b'] }
    nonZero.frozen = { ...zero.frozen, value: 1, basis: basisFingerprint(nonZero) }
    expect(evaluate([nonZero], corpus(['components/a.tsx', 'rounded-lg']))[0].unearned).toBe(true)
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

  // 🔴 THE BUG (Phase 9, docs/DAWN-CONVERSION.md §4). raw-button-bg was
  // `<button[\s\S]{0,500}?bg-primary` — a 500-character PROXIMITY WINDOW over arbitrary JSX, not a
  // count of buttons. It bound a `<button>` to any bg-primary that happened to fall within 500
  // characters, including one on a child element, and it read whitespace: over this repo's corpus
  // collapsing indentation alone moved it 517 → 558 with no code changed. The ratchet for the
  // largest sweep in the conversion (1,887 raw <button> sites) could not count buttons.
  const buttons = (src: string) => (src.match(pattern('raw-button-bg')) ?? []).length

  it('raw-button-bg counts the OPENING TAG, reading past an onClick arrow', () => {
    // `=>` is why a plain `[^>]*` cannot be used: `onClick={() => …}` ends the scan at the arrow,
    // and most raw buttons carry a handler BEFORE their className. That mis-fix under-counts, which
    // is the direction a ratchet must never be wrong in.
    expect(buttons('<button type="button" onClick={() => go()} className="rounded-pill bg-primary">Go</button>')).toBe(1)
    expect(buttons('<button onClick={() => { setOpen(true) }} className={cn(active && "bg-primary")}>Go</button>')).toBe(1)
    // One match per BUTTON, not per token: two primary classes in one tag are still one site.
    expect(buttons('<button className="bg-primary hover:bg-primary-hover">Go</button>')).toBe(1)
  })

  it('raw-button-bg does NOT attribute a CHILD element’s fill to the button above it', () => {
    // The whole defect in one fixture: the button is unstyled, the badge inside it carries the
    // fill. The 500-char window called this a raw primary button; the opening-tag form does not.
    expect(buttons('<button type="button"><span className="bg-primary">3</span></button>')).toBe(0)
    // …and a sibling further down the file is not "near enough" to count either.
    expect(buttons('<button type="button">Go</button>\n<div className="bg-primary" />')).toBe(0)
  })

  it('raw-button-bg does not move when the code is reformatted', () => {
    // The property the old pattern lacked. Same markup, different whitespace: same number.
    const indented = [
      '<button',
      '  type="button"',
      '  onClick={() => submit()}',
      '  disabled={pending || rating < 1}',
      '  className="rounded-lg bg-primary px-4"',
      '>',
      '  Send',
      '</button>',
    ].join('\n')
    expect(buttons(indented)).toBe(1)
    expect(buttons(indented.replace(/\n\s*/g, ' '))).toBe(1)
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

  // The three Phase 3 field ratchets, seeded 2026-08-05. Same opening-tag discipline as
  // raw-button-bg: what makes them work is that JSX components are CAPITALISED, so adopting the
  // primitive is the only way to stop matching. A pattern that also matched <Select> would be a
  // ratchet nobody could ever satisfy.
  it('raw-select counts a raw <select> and never the Select primitive', () => {
    const re = pattern('raw-select')
    expect('<select className="border" onChange={(e) => set(e)}>'.match(re)).toHaveLength(1)
    expect('<Select value={v} onChange={set} />'.match(re)).toBeNull()
    expect('</select>'.match(re)).toBeNull()
    expect('<selection />'.match(re), 'the \\b keeps a longer tag name out').toBeNull()
  })

  it('raw-textarea counts a raw <textarea> and never the Field primitive', () => {
    const re = pattern('raw-textarea')
    expect('<textarea rows={2} className="resize-y" />'.match(re)).toHaveLength(1)
    expect('<Field as="textarea" />'.match(re)).toBeNull()
  })

  it('raw-input counts real controls but NOT type="hidden", which no primitive can receive', () => {
    const re = pattern('raw-input')
    for (const s of ['<input name="q" />', '<input type="text" className="w-full" />', '<input type="checkbox" />']) {
      expect(s.match(re), `${s} is a raw control`).toHaveLength(1)
    }
    // A hidden input is form serialisation, not a control. Counting it would put 0 out of reach
    // and fail CI on a legitimate hidden field — a ratchet that punishes correct code.
    expect('<input type="hidden" name="csrf" value={t} />'.match(re)).toBeNull()
    expect("<input type='hidden' name='csrf' />".match(re)).toBeNull()
    // …and the lookahead is bounded to the tag's OWN attributes: a hidden input LATER in the file
    // must not excuse the visible control above it.
    expect('<input name="q" />\n<input type="hidden" name="csrf" />'.match(re)).toHaveLength(1)
    expect('<Field name="q" />'.match(re)).toBeNull()
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
