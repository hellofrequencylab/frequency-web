import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  contrastRatio,
  parseColor,
  luminance,
  selectorWeight,
  resolveTokens,
  deref,
  evaluateContrast,
  ROLE_MINIMUM,
  PAIRS,
  STATES,
} from './check-contrast.mjs'

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
    expect(contrastRatio('#3D352A', '#FAF8F4')).toBeCloseTo(contrastRatio('#FAF8F4', '#3D352A'), 10)
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
      expect(inState.length, `${s.key} produced no rows`).toBe(PAIRS.length)
      expect(inState.every((r) => !r.unresolved), `${s.key} has unresolved tokens`).toBe(true)
    }
  })
})
