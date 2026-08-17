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
  countEntry,
  stripComments,
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

// The provenance stamp `check-adoption.mjs` writes onto a baseline entry. `from`/`basis` are
// present only on the directions that need them (`raised`/`lowered` carry `from`, a `rebased`
// stamp carries the fingerprint it was rebased onto), which is why they are optional here.
type Frozen = {
  at: string
  value: number
  direction: string
  reason: string
  from?: number
  basis?: string
}

type Entry = {
  key: string
  description: string
  mode: string
  patterns: string[]
  include: string[]
  exclude: string[]
  baseline: number
  frozen?: Frozen
  history?: Frozen[]
}

const frozen = (value: number, over: Partial<Frozen> = {}): Frozen => ({
  at: '2026-08-04',
  value,
  direction: 'seed',
  reason: 'seeded from the verification census',
  ...over,
})

const entry: Entry = {
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PHASE 9 — the two instrument defects (docs/DAWN-CONVERSION.md §4 queue), plus the corpus defect
// underneath them that made the first fix 40% inert. Landed 2026-08-17 (PROG-DAWN9).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('check-adoption — stripComments: a string literal is not code (strip-comments@2)', () => {
  // 🔴 THE BUG. `stripComments` blanked block comments with a regex, and a regex cannot tell a
  // comment opener from two characters inside a string. Every file input in the repo carries an
  // `accept` glob whose last two characters are a slash and a star, which opened a comment that ran
  // to the next close-comment token anywhere in the file. Measured over {app,components,lib}: 101
  // files, 121,627 characters of REAL markup blanked, hiding 23 debt sites across six classes — so
  // literal-radius printed "✅ shrank" (2,281 against a 2,287 floor) while its true count was 2,292.
  //
  // The @1 blanker, kept verbatim, so the fix is asserted against the thing it replaced rather than
  // against a description of it.
  const strip1 = (text: string) => {
    const blank = (m: string) => m.replace(/[^\n]/g, ' ')
    return text
      .replace(/\/\*[\s\S]*?\*\//g, blank)
      .replace(/(^|\n)([ \t]*\/\/[^\n]*)/g, (_m, lead: string, body: string) => lead + blank(body))
  }

  const fileInput = [
    '<input type="file" accept="image/*" className="hidden rounded-lg" />',
    'const x = 1',
    '/** a JSDoc block, whose closing token is what the pseudo-comment ran to. */',
    '<div className="rounded-lg" />',
  ].join('\n')

  it('does NOT treat an accept glob inside a string as a comment opener', () => {
    // @1 swallowed everything from the glob to the end of the JSDoc: the input's own className, the
    // statement below it, and the rounded-lg two lines down all left the corpus.
    expect(strip1(fileInput)).not.toContain('const x = 1')
    expect((strip1(fileInput).match(/rounded-lg/g) ?? []).length).toBe(1)
    // @2 keeps every one of them.
    expect(stripComments(fileInput)).toContain('const x = 1')
    expect((stripComments(fileInput).match(/rounded-lg/g) ?? []).length).toBe(2)
  })

  it('still blanks the comments it was written to blank', () => {
    expect(stripComments('/* shadow-lg */').trim()).toBe('')
    expect(stripComments('  // shadow-lg, quoted in prose').trim()).toBe('')
    expect(stripComments('{/* KEEP bg-white: a scanner needs true white. */}').replace(/[{}\s]/g, '')).toBe('')
    // …and still does NOT blank a trailing `//`, because the `//` in an https:// URL would take a
    // real class down with it — a false FALL, the direction a ratchet must never be wrong in.
    expect(stripComments('<a className="rounded-lg" /> // see https://x.dev')).toContain('rounded-lg')
  })

  it('is LENGTH-PRESERVING, which is what lets a match map back onto its source line', () => {
    for (const s of [fileInput, '/* a */ b', '  // c\nd', '`tpl ${/* x */ y}`']) {
      expect(stripComments(s)).toHaveLength(s.length)
      expect(stripComments(s).split('\n')).toHaveLength(s.split('\n').length)
    }
  })

  it('can only ever UN-blank relative to @1, so the correction cannot hide debt', () => {
    // The safety property, asserted rather than asserted-about: every character @2 blanks, @1 blanked
    // too. A corpus change able to blank MORE could book a phantom sweep.
    for (const s of [fileInput, 'a/*b*/c', "x = 'a/*b' + c\n/* real */", '`t/*u`\n// v', 'p // q']) {
      const a = strip1(s)
      const b = stripComments(s)
      for (let i = 0; i < s.length; i++) {
        if (b[i] === ' ' && s[i] !== ' ') {
          expect(a[i], `@2 blanked char ${i} of ${JSON.stringify(s)} that @1 kept`).toBe(' ')
        }
      }
    }
  })

  it('an unterminated quote in JSX prose stops at the newline (bounded, and in the safe direction)', () => {
    const src = '<p>don\'t</p>\n/* shadow-lg */\n<div className="rounded-lg" />'
    expect(stripComments(src)).toContain('rounded-lg')
    expect(stripComments(src)).not.toContain('shadow-lg')
  })
})

describe('check-adoption — `escape`: a carve-out is a written reason, not a wider glob', () => {
  // 🔴 THE BUG (Phase 9 queue, second item). `white-black-literals` read 27 and had read 27 since
  // 2026-08-06. All 27 carried a `KEEP <util>: <reason>` comment — QR quiet zones, video letterboxes,
  // an email preview frame — so not one was retirable and the floor was 27. The queue recorded the
  // floor as 2 (the `app/print/**` pair). Both numbers are the same defect: a total cannot tell a
  // justified carve-out from new debt, so the two are FUNGIBLE in it. Retire one annotated site, add
  // one bare `bg-white`, and the gate reads 27 → 27, "✅ held", green.
  const mono = {
    key: 'white-black-literals',
    description: 'hardcoded monochromes',
    mode: 'matches',
    patterns: ['(?:-white\\b|white/\\d+|(?<!font)-black\\b)'],
    escape: { pattern: 'KEEP\\s+[\\w/-]+:\\s*\\S' },
    include: ['{app,components}/**/*.tsx'],
    exclude: [],
    baseline: 0,
  }
  const count = (text: string) => countEntry(mono, [{ path: 'app/a.tsx', text: stripComments(text), source: text }]).count

  it('counts a bare monochrome and NOT one that carries a stated reason', () => {
    expect(count('<div className="bg-white" />')).toBe(1)
    expect(count('// KEEP bg-white: a QR reader needs a true-white quiet zone.\n<div className="bg-white" />')).toBe(0)
  })

  it('reaches an annotation across a `return (` and through a multi-line JSX comment', () => {
    // Both shapes are live in the repo, and a fixed three-line window mis-read both of them.
    expect(count(['// KEEP bg-white: these sheets are printed.', 'return (', '  <div className="bg-white" />'].join('\n'))).toBe(0)
    expect(
      count(
        [
          '{/* KEEP text-white: the tick sits on the operator’s own chosen hex, which is a',
          '    literal colour and not a themed surface, so no token resolves against it. */}',
          '{active && <Check className="text-white" />}',
        ].join('\n'),
      ),
    ).toBe(0)
  })

  it('does NOT let one annotation cover two literals — the second site counts', () => {
    // The hole an exclude glob has and this does not: a carve-out exempts the site it was written
    // about, and the next one has to say its own piece.
    const two = [
      '// KEEP bg-white: a QR reader needs a true-white quiet zone.',
      '<div className="bg-white" />',
      '<div className="bg-white" />',
    ].join('\n')
    expect(count(two)).toBe(1)
  })

  it('does NOT reach across a blank line, so an annotation cannot drift onto later code', () => {
    expect(count(['// KEEP bg-white: a QR reader needs a true-white quiet zone.', '', '<div className="bg-white" />'].join('\n'))).toBe(1)
  })

  it('demands a utility AND a reason — a bare shrug does not buy an exemption', () => {
    expect(count('// KEEP\n<div className="bg-white" />')).toBe(1)
    expect(count('// KEEP bg-white:\n<div className="bg-white" />')).toBe(1)
    expect(count('// keep it white\n<div className="bg-white" />')).toBe(1)
  })

  it('is part of the measurement BASIS, so loosening it cannot pass as the same question', () => {
    expect(basisFingerprint(mono)).not.toEqual(basisFingerprint({ ...mono, escape: { pattern: 'KEEP' } }))
    expect(basisFingerprint(mono)).not.toEqual(basisFingerprint({ ...mono, escape: undefined }))
  })

  it('REFUSES to be declared in files mode rather than silently ignoring it', () => {
    // A declared-but-unhonoured escape would read as annotation-aware while counting everything —
    // the exact shape of the defect it was added to fix.
    expect(() =>
      countEntry({ ...mono, mode: 'files' }, [{ path: 'app/a.tsx', text: 'bg-white', source: 'bg-white' }]),
    ).toThrow(/cannot be honoured in mode "files"/)
  })
})

describe('check-adoption — raw-input: a concealed file trigger is not a field', () => {
  // 🔴 THE BUG (Phase 9 queue, first item). The lookahead excluded `type="hidden"` and nothing else,
  // so `<input type="file">` triggers — held behind `hidden` or `sr-only` and fired by a sibling
  // button — counted as un-adopted fields. No text-field primitive can receive them, so they were
  // permanently un-retirable debt INSIDE a ratchet, for exactly the reason `type="hidden"` was
  // excluded in the first place. The queue said "~18"; a TypeScript-AST census of the entry's own
  // scope says 37, and 0 of the 37 are visible.
  const config = loadConfig()
  const re = () => new RegExp(config.entries.find((e: { key: string }) => e.key === 'raw-input')!.patterns[0], 'g')
  const n = (s: string) => (s.match(re()) ?? []).length

  it('does not count a file trigger held behind hidden or sr-only, in EITHER attribute order', () => {
    expect(n('<input ref={r} type="file" accept="image/*" className="hidden" onChange={(e) => go(e)} />')).toBe(0)
    expect(n('<input type="file" accept={DOC_TYPES} className="sr-only" />')).toBe(0)
    // className may precede type — which is why this is a nested lookahead and not a sequence.
    expect(n('<input className="hidden" type="file" />')).toBe(0)
    expect(n('<input className="sr-only" ref={r} type="file" multiple />')).toBe(0)
    // …and the bare boolean attribute, which is how one call site spells it.
    expect(n('<input ref={r} type="file" accept="image/*" hidden disabled={busy} />')).toBe(0)
  })

  it('STILL counts a VISIBLE file input, which is a control a primitive could own', () => {
    // The non-vacuity of the carve-out: it exempts the trigger SHAPE, not the element. A styled,
    // on-screen file field is debt exactly like any other raw control.
    expect(n('<input type="file" className="w-full rounded-control border" />')).toBe(1)
    expect(n('<input type="file" />')).toBe(1)
    // `aria-hidden` is not `hidden`; the lookbehind is what keeps it out.
    expect(n('<input type="file" aria-hidden />')).toBe(1)
  })

  it('does not let a concealment class on a DIFFERENT element excuse a real control', () => {
    expect(n('<input type="text" name="q" />\n<span className="hidden" />')).toBe(1)
    expect(n('<input name="q" />\n<input type="file" className="hidden" />')).toBe(1)
    // The type="hidden" carve-out is untouched.
    expect(n('<input type="hidden" name="csrf" />')).toBe(0)
  })
})
