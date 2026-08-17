import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  contrastRatio,
  parseColor,
  luminance,
  selectorWeight,
  resolveTokens,
  deref,
  resolveSide,
  evaluateContrast,
  withAlpha,
  ROLE_MINIMUM,
  PAIRS,
  RANK_KEYS,
  STATES,
  stripCssComments,
} from './check-contrast.mjs'

/** Every .tsx under a root, recursively. */
function tsxFiles(root: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, e.name)
    if (e.isDirectory()) out.push(...tsxFiles(p))
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) out.push(p)
  }
  return out
}

// Locks the token-pair contrast gate (Lift 3a, docs/UX-MATURITY-PLAN.md). Two jobs: the WCAG math
// must be right (a wrong ratio is worse than no gate — it would certify a failure), and the state
// resolver must reproduce the real cascade, since three of the four render states are produced by
// selectors overriding each other rather than by their own complete palette.

const FIXTURE = `
:root {
  --color-canvas: #FFFFFF;
  --color-text: #000000;
  --color-alias: var(--color-text);
}
[data-skin="midnight"] {
  --color-canvas: #EEEEEE;
  --color-text: #111111;
}
.dark {
  --color-canvas: #000000;
  --color-text: #FFFFFF;
}
.dark [data-skin="midnight"] {
  --color-canvas: #101010;
}
`

describe('check-contrast — WCAG math', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5)
  })

  it('a color against itself is 1:1', () => {
    expect(contrastRatio('#E2912F', '#E2912F')).toBeCloseTo(1, 10)
  })

  it('matches the reference value for the classic AA grey (#767676 on white ≈ 4.54)', () => {
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2)
  })

  it('is symmetric — order of the pair does not change the ratio', () => {
    // `!`: contrastRatio returns null only for an unparseable color, and both of these are literal hex.
    expect(contrastRatio('#3D352A', '#FAF8F4')).toBeCloseTo(contrastRatio('#FAF8F4', '#3D352A')!, 10)
  })

  it('computes relative luminance at the endpoints', () => {
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 10)
    expect(luminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 10)
  })

  it('parses shorthand hex, 8-digit hex, and rgb()/rgba()', () => {
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 })
    expect(parseColor('#00000080')?.a).toBeCloseTo(0.502, 2)
    expect(parseColor('rgba(255, 226, 184, 0.22)')).toEqual({ r: 255, g: 226, b: 184, a: 0.22 })
    expect(parseColor('not-a-color')).toBeNull()
  })

  it('composites a translucent foreground over its backdrop before measuring', () => {
    // 50% black over white is mid-grey, not black: nowhere near 21:1.
    const ratio = contrastRatio('#00000080', '#FFFFFF')!
    expect(ratio).toBeGreaterThan(3)
    expect(ratio).toBeLessThan(6)
  })
})

describe('check-contrast — the four-state cascade', () => {
  it('scores only the four state-defining selectors', () => {
    const dawnDark = { key: 'DAWN dark', mode: 'dark', skin: 'default' }
    expect(selectorWeight(':root', dawnDark)).toBe(10)
    expect(selectorWeight('.dark', dawnDark)).toBe(10)
    expect(selectorWeight('[data-skin="midnight"]', dawnDark)).toBeNull()
    expect(selectorWeight('.dark [data-occasion="solstice"]', dawnDark)).toBeNull()
    expect(selectorWeight('.rank-badge', dawnDark)).toBeNull()
  })

  it('resolves DAWN light from :root alone', () => {
    const t = resolveTokens(FIXTURE, STATES[0])
    expect(deref(t, '--color-canvas')).toBe('#FFFFFF')
    expect(deref(t, '--color-text')).toBe('#000000')
  })

  it('lets .dark beat an earlier [data-skin] block on equal specificity (source order)', () => {
    const midnightDark = { key: 'Midnight dark', mode: 'dark', skin: 'midnight' }
    const t = resolveTokens(FIXTURE, midnightDark)
    // --color-text: midnight-light says #111111, .dark (later, equal specificity) says #FFFFFF.
    expect(deref(t, '--color-text')).toBe('#FFFFFF')
    // --color-canvas: the two-part selector outranks both.
    expect(deref(t, '--color-canvas')).toBe('#101010')
  })

  it('follows var() aliases to a literal', () => {
    const t = resolveTokens(FIXTURE, STATES[1])
    expect(deref(t, '--color-alias')).toBe('#FFFFFF')
  })
})

describe('check-contrast — the gate', () => {
  const pair = [{ fg: '--color-text', bg: '--color-canvas', role: 'body', note: 'body copy' }]

  it('passes a good pair in every state', () => {
    const rows = evaluateContrast(FIXTURE, { pairs: pair })
    // Derived, not the literal 4. This assertion hardcoded the state count and so failed the
    // moment a fifth state was added — which is the guard working, but the guard should be
    // "one row per state", not "there are exactly four states".
    expect(rows).toHaveLength(STATES.length)
    expect(rows.every((r) => r.pass)).toBe(true)
  })

  it('covers the light-lock, and it resolves to the DAWN light palette', () => {
    // The regression this state exists for: `.theme-light-lock` force-lights a page on a DARK
    // device, and before 2026-08-05 it re-asserted 29 of 57 roles — so anything it forgot kept
    // its dark value on a cream page (a live funnel rendered warning text at 1.77:1).
    // If the lock is TOTAL, every token resolves identically in the two states. Comparing them
    // is what makes a future half-lock fail here instead of shipping.
    const lock = STATES.find((s) => s.key === 'Light-lock on a dark device')
    expect(lock, 'the light-lock render state must exist').toBeTruthy()

    const css = readFileSync('app/globals.css', 'utf8')
    const light = resolveTokens(css, STATES.find((s) => s.key === 'DAWN light')!)
    const locked = resolveTokens(css, lock!)
    const drift = [...light.keys()]
      .filter((k) => k.startsWith('--color-') || k.startsWith('--brand-'))
      .filter((k) => deref(light, k) !== deref(locked, k))
    expect(drift, `roles the light-lock fails to re-assert: ${drift.join(', ')}`).toEqual([])
  })

  it('FAILS a deliberately bad pair, and reports the shortfall', () => {
    const bad = '\n:root {\n  --color-canvas: #FFFFFF;\n  --color-text: #BBBBBB;\n}\n'
    const rows = evaluateContrast(bad, { pairs: pair, states: [STATES[0]] })
    expect(rows[0].pass).toBe(false)
    expect(rows[0].ratio).toBeLessThan(2)
    expect(rows[0].min).toBe(ROLE_MINIMUM.body)
  })

  it('FAILS when a pair references a token that does not resolve (a renamed token is a regression)', () => {
    const rows = evaluateContrast(FIXTURE, {
      pairs: [{ fg: '--color-nope', bg: '--color-canvas', role: 'body', note: 'missing' }],
      states: [STATES[0]],
    })
    expect(rows[0].unresolved).toBe(true)
    expect(rows[0].pass).toBe(false)
  })

  it('declares a minimum for every role used in the pair table', () => {
    for (const p of PAIRS) expect(ROLE_MINIMUM[p.role], `role "${p.role}" has no minimum`).toBeGreaterThan(0)
    expect(ROLE_MINIMUM.body).toBe(4.5)
    expect(ROLE_MINIMUM.large).toBe(3.0)
    expect(ROLE_MINIMUM.edge).toBe(3.0)
  })
})

describe('check-contrast — the shipped palette', () => {
  it('holds every pair in all four render states (waived pairs at their frozen floor)', () => {
    const rows = evaluateContrast(readFileSync('app/globals.css', 'utf8'))
    const failed = rows.filter((r) => !r.pass).map((r) => `${r.state}: ${r.pair} = ${r.ratio?.toFixed(2)} < ${r.min}`)
    expect(failed).toEqual([])
  })

  it('measures all four states (no state silently resolving to nothing)', () => {
    const rows = evaluateContrast(readFileSync('app/globals.css', 'utf8'))
    for (const s of STATES) {
      const inState = rows.filter((r) => r.state === s.key)
      // The expected count is the pairs that APPLY to this state, not PAIRS.length. `only` has
      // been a documented part of the pair shape since this table was written ("`only` restricts
      // a pair to the states where the surface actually exists") but had no user until
      // 2026-08-10, so this assertion had never been exercised against one — it would have failed
      // for the first person to use the feature as designed. The test's real subject is unchanged:
      // a state that resolves to NOTHING, or to unresolved tokens, still fails here.
      const applicable = PAIRS.filter((p) => !p.only || p.only.includes(s.key))
      expect(applicable.length, `${s.key} has no applicable pairs`).toBeGreaterThan(0)
      expect(inState.length, `${s.key} produced no rows`).toBe(applicable.length)
      expect(inState.every((r) => !r.unresolved), `${s.key} has unresolved tokens`).toBe(true)
    }
  })
})

describe('the rank spectrum is inside the contract', () => {
  // 🔴 THE HOLE. Ten rank primitives × three steps drive every crest, pip, chip and dot in The
  // Quest, and not one of them appeared in the pair table — because the table only modelled
  // NAMED pairs and no token is named "the ink that goes on a rank ground". The gate reported
  // green while components/quest/journey-progress-card.tsx painted a check glyph at 2.90:1.
  const css = readFileSync('app/globals.css', 'utf8')
  const rows = evaluateContrast(css)

  it('covers all ten primitives on all three grounds', () => {
    expect(RANK_KEYS).toHaveLength(10)
    for (const r of RANK_KEYS) {
      const forRank = PAIRS.filter((p) => p.bg === `--rank-${r}` || p.bg === `--rank-${r}-deep`)
      expect(forRank.map((p) => `${p.fg} on ${p.bg}`).sort(), `rank ${r} is not fully covered`).toEqual([
        `#FFFFFF on --rank-${r}`,
        `--color-on-ink on --rank-${r}-deep`,
        `--color-text-on-rank on --rank-${r}`,
      ])
    }
  })

  it('resolves a literal side without going through the cascade', () => {
    // The white-on-core pairing has no token to name, so the table states it as a literal. That
    // is the ONLY reason literals are allowed; a literal must still resolve, or the "no
    // unresolved token" guard below would be trivially satisfiable by typing nonsense.
    const t = resolveTokens(FIXTURE, STATES[0])
    expect(resolveSide(t, '#FFFFFF')).toBe('#FFFFFF')
    expect(resolveSide(t, '--color-canvas')).toBe('#FFFFFF')
    expect(resolveSide(t, '--color-nope')).toBeNull()
  })

  it('holds a GLYPH on a rank core to 1.4.11 (3:1), not the 4.5 text bar — stated, not assumed', () => {
    // `text-on-rank`, not `text-on-primary`. They were the same token until 2026-08-06, when the
    // amber darkened so white could sit on it — at which point the button LABEL went white and
    // would have taken every rank glyph with it, onto gold, at 2.46:1. Two jobs, two tokens.
    const glyphs = PAIRS.filter((p) => p.fg === '--color-text-on-rank' && /^--rank-[a-z]+$/.test(p.bg))
    expect(glyphs).toHaveLength(10)
    for (const p of glyphs) expect(p.role, `${p.bg} must be an edge/1.4.11 pair`).toBe('edge')
    expect(ROLE_MINIMUM.edge).toBe(3.0)
  })

  it('a rank CORE may carry a glyph but never a label — slate and plum prove it', () => {
    // The reason (A) is `edge` and not `body`: two of the ten cores miss 4.5 against the dark ink.
    // If that ever stops being true the role could be tightened; until then the ceiling is real
    // and this test is what keeps "core = glyph, deep = label" from being folklore.
    const t = resolveTokens(css, STATES[0])
    const ink = deref(t, '--color-text-on-rank')!
    expect(contrastRatio(ink, deref(t, '--rank-slate')!)!).toBeLessThan(ROLE_MINIMUM.body)
    expect(contrastRatio(ink, deref(t, '--rank-plum')!)!).toBeLessThan(ROLE_MINIMUM.body)
    // …and both clear the glyph bar comfortably, which is why the crest pattern is sound.
    expect(contrastRatio(ink, deref(t, '--rank-slate')!)!).toBeGreaterThan(ROLE_MINIMUM.edge)
    expect(contrastRatio(ink, deref(t, '--rank-plum')!)!).toBeGreaterThan(ROLE_MINIMUM.edge)
  })

  it('the DEEP step carries the light ink at full AA in every state', () => {
    const deep = rows.filter((r) => r.pair.startsWith('on-ink on rank-') && r.pair.endsWith('-deep'))
    expect(deep).toHaveLength(RANK_KEYS.length * STATES.length)
    for (const r of deep) {
      expect(r.role).toBe('body')
      expect(r.waived, `${r.pair} must not need a waiver`).toBe(false)
      expect(r.pass, `${r.state}: ${r.pair} = ${r.ratio?.toFixed(2)}:1`).toBe(true)
    }
  })

  it('white on a core fails on gold and only gold, and gold is waived rather than deleted', () => {
    const white = rows.filter((r) => r.pair.startsWith('#FFFFFF on rank-'))
    expect(white).toHaveLength(RANK_KEYS.length * STATES.length)
    // A waived row still PASSES (at its frozen floor) — the assertion is about which pair carries
    // the waiver, so the gold hole cannot be quietly widened to a second rank.
    const waived = [...new Set(white.filter((r) => r.waived).map((r) => r.pair))]
    expect(waived).toEqual(['#FFFFFF on rank-gold'])
    for (const r of white) expect(r.pass, `${r.state}: ${r.pair}`).toBe(true)
  })

  it('the rank steps are mode-invariant, so one measurement covers every state', () => {
    // If a skin or `.dark` block ever starts overriding a rank primitive, these families would
    // need per-state floors and this assertion is where that shows up.
    for (const key of RANK_KEYS) {
      for (const step of ['', '-deep', '-bright']) {
        const values = new Set(STATES.map((s) => deref(resolveTokens(css, s), `--rank-${key}${step}`)))
        expect(values.size, `--rank-${key}${step} differs across render states: ${[...values].join(', ')}`).toBe(1)
      }
    }
  })

  it('no component paints a rank ground through an @theme-inline-only alias', () => {
    // THE EXACT SHAPE OF THE LIVE BUG. `@theme inline { --color-on-primary: … }` inlines its
    // value into the `text-on-primary` UTILITY and does NOT emit the custom property to :root,
    // so `style={{ color: 'var(--color-on-primary)' }}` is undefined at computed-value time and
    // the element silently inherits --color-text. Verified against tailwindcss v4's compiler.
    // The utility class is fine; the raw var is not. Same trap as `--color-rank-*`.
    const inlineOnly = stripCssComments(css)
      .match(/@theme inline\s*\{[\s\S]*?\n\}/)?.[0]
      ?.match(/(--color-[A-Za-z0-9-]+)\s*:\s*var\(/g)
      ?.map((m) => m.split(':')[0].trim()) ?? []
    expect(inlineOnly.length, 'no @theme inline aliases found — the parse is wrong').toBeGreaterThan(10)

    // Only the aliases that are NOT also declared as a real :root role can be undefined at
    // runtime (`--color-on-ink` is both an alias and a role, so a raw var on it is fine).
    const tokens = resolveTokens(css, STATES[0])
    const undefinedAtRuntime = inlineOnly.filter((a) => resolveSide(tokens, a) === null)
    expect(undefinedAtRuntime).toContain('--color-on-primary')

    const offenders: string[] = []
    for (const file of tsxFiles('components')) {
      // Comments are stripped first: this very guard is explained in prose at the fixed call
      // site, and a guard that fails on its own documentation is a guard nobody keeps.
      const src = stripCssComments(readFileSync(file, 'utf8')).replace(/\/\/.*$/gm, '')
      for (const alias of undefinedAtRuntime) {
        if (src.includes(`var(${alias})`)) offenders.push(`${file}: var(${alias})`)
      }
    }
    expect(offenders, `raw var() on an @theme-inline-only alias:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('the focus ring is measured AS PAINTED, not as declared', () => {
  // 🔴 THE BUG. globals.css drew the control ring through
  // `color-mix(in srgb, var(--color-focus-ring) 45%, transparent)`. This gate read the TOKEN,
  // at full opacity, and reported a comfortable 3.87:1 — while the page painted 1.75:1, well
  // under the 3:1 WCAG 1.4.11 requires of a non-text indicator. A gate that measures the
  // declaration cannot see a use site that thins it.
  const css = readFileSync('app/globals.css', 'utf8')

  it('withAlpha multiplies into any alpha the colour already carries', () => {
    expect(withAlpha('#B86A15', 1)?.a).toBe(1)
    expect(withAlpha('#B86A15', 0.45)?.a).toBeCloseTo(0.45, 6)
    // rgba(…, 0.5) painted at 50% is 25% — the two compose, they do not replace.
    expect(withAlpha('rgba(0, 0, 0, 0.5)', 0.5)?.a).toBeCloseTo(0.25, 6)
    expect(withAlpha('not-a-colour', 0.5)).toBeNull()
  })

  it('a 45% ring on the page canvas is under 3:1 — the ratio that actually shipped', () => {
    const painted = contrastRatio(withAlpha('#B86A15', 0.45), '#FAF8F4')
    expect(painted).toBeLessThan(ROLE_MINIMUM.edge)
    expect(painted).toBeCloseTo(1.75, 1)
    // And solid, the same token clears the bar — so the ALPHA was the defect, not the hue.
    expect(contrastRatio('#B86A15', '#FAF8F4')).toBeGreaterThan(ROLE_MINIMUM.edge)
  })

  it('no colour could have rescued a 45% ring — pure black tops out under 3.4:1', () => {
    // The decisive fact: at 45% over white the best achievable contrast is ~3.35:1, and that is
    // with pure black. Re-tinting the token was never going to fix this; the opacity had to go.
    expect(contrastRatio(withAlpha('#000000', 0.45), '#FFFFFF')).toBeLessThan(3.4)
  })

  it('globals.css paints both focus rings at full strength', () => {
    // Guards the fix at its source. If either use site reintroduces a color-mix, the matching
    // `alpha` must be added to the PAIRS entry or this table silently starts lying again.
    const rings = css.match(/:focus-visible\s*\{[^}]*box-shadow:[^;]*;/g) ?? []
    const thinned = rings.filter((r) => /color-mix\([^)]*transparent/.test(r))
    expect(thinned, `focus rings drawn through a transparent color-mix: ${thinned.join(' | ')}`).toEqual([])
  })

  it('fields and controls share one focus token, so one measurement covers both', () => {
    // Fields used to ring with --color-border-strong at 60% (1.26:1 on white). That token is a
    // hairline tone step; its own waiver argues controls are identified by "fill + label + focus
    // ring", which only holds while the ring is visible.
    const fieldRule = css.match(/:where\(input, textarea\):focus-visible\s*\{[^}]*\}/)?.[0] ?? ''
    expect(fieldRule).toContain('var(--color-focus-ring)')
    expect(fieldRule).not.toContain('--color-border-strong')
  })

  it('every focus-ring pair clears the edge minimum in every state', () => {
    const rows = evaluateContrast(css).filter((r) => r.pair.startsWith('focus-ring'))
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.pass, `${r.state}: ${r.pair} = ${r.ratio?.toFixed(2)}:1 (min ${r.min})`).toBe(true)
    }
  })
})
