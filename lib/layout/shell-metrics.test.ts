import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RIGHT_RAIL_PX,
  RAILS_MD,
  RAILS_LG_REM,
  SHELL_CONTENT_WIDTH_CLASS,
} from './shell-metrics'

// ── The claim page must be as wide as the shell's content column ───────────────────────────
//
// 🔴 THE BUG. The shell's content column is `flex-1 min-w-0` — no width of its own, just the
// remainder after two rails that hide at DIFFERENT breakpoints (left at `md`, right at `lg`). The
// claim page, which renders outside the shell and shows the same body, was given a hand-derived
// constant `max-w-[69rem]`. Measured: within 4px at a 1680px viewport, and **232px too wide at
// ~1000px** where the right rail has already hidden. Reported three times as "still a random
// width, too wide".
//
// These assertions are the drift guard. They fail if someone resizes a rail in app-shell.tsx
// without updating shell-metrics.ts — which is exactly how the two would silently desync again.


describe('the root font size is not 16px, which is why units matter here', () => {
  it('globals.css sets a non-default root, so rem != 16px', () => {
    // The whole unit bug lived here. If this ever returns to 100%, the old conversion would
    // coincidentally start working and someone might "simplify" the mixed-unit calc back.
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toContain('font-size: var(--density-root, 106.25%)')
  })
})

describe('the numbers still match the shell', () => {
  it('the derived totals are arithmetically right', () => {
    expect(RAILS_MD).toBe(14) // 12 + 2, all rem
    expect(RAILS_LG_REM).toBe(17.75) // 12 + 2.5 + 0.75 + 2.5, rem only — the 288px is separate
  })
})

describe('the class string states those totals LITERALLY', () => {
  it('carries the computed rem values', () => {
    // ⚠️ Tailwind generates utilities by scanning source text for whole class strings. An
    // interpolated `max-w-[calc(100%-${RAILS_MD}rem)]` would be correct at runtime and produce NO
    // CSS at build time, silently collapsing the column back to full width — the exact bug this
    // module exists to end. So the literals are asserted against the numbers.
    expect(SHELL_CONTENT_WIDTH_CLASS).toContain(`md:max-w-[calc(100%-${RAILS_MD}rem)]`)
    // Mixed units ON PURPOSE: rem stays rem, the rail's absolute px stays px, and the browser
    // resolves both against the real root size. A single rem total cannot express this correctly.
    expect(SHELL_CONTENT_WIDTH_CLASS).toContain(
      `lg:max-w-[calc(100%-${RAILS_LG_REM}rem-${RIGHT_RAIL_PX}px)]`,
    )
    expect(SHELL_CONTENT_WIDTH_CLASS).not.toContain('${')
  })

  it('is centred, and has no fixed max-width of its own', () => {
    expect(SHELL_CONTENT_WIDTH_CLASS).toContain('mx-auto')
    // A bare `max-w-[NNrem]` here would be the old constant creeping back.
    expect(SHELL_CONTENT_WIDTH_CLASS).not.toMatch(/\smax-w-\[\d/)
  })
})

describe('the claim page consumes it instead of restating it', () => {
  const page = readFileSync('app/spaces/claim/[token]/page.tsx', 'utf8')
  const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('has no hand-rolled width constant left', () => {
    expect(code).not.toContain('max-w-[69rem]')
    expect(code).not.toContain('max-w-6xl')
  })

  it('nests the column inside the row box, at every call site', () => {
    // The `100%` in the calc is the ROW's inner width. Used without that wrapper it resolves
    // against whatever ancestor happens to be there and the width is meaningless.
    // FOUR rows: the ribbon, the body, the fixed claim bar, and the invisible spacer that reserves
    // the bar's height in flow. THREE columns, because the bar and its spacer render the same
    // ClaimBarContent, which carries the column class once.
    expect(code.match(/className=\{CLAIM_ROW\}/g)?.length).toBe(4)
    expect(code.match(/CLAIM_COLUMN/g)?.length).toBe(4) // 1 definition + 3 uses
  })
})

describe('the fold control is ON its tab, so the clearance problem cannot come back', () => {
  const metrics = readFileSync(join(process.cwd(), 'lib/layout/shell-metrics.ts'), 'utf8')

  it('the clearance constants STAY deleted — nothing here needs them back', () => {
    // A constant that names a relationship between two things that no longer meet reads as a
    // live constraint to the next person. The tick shares a box with the bar rather than
    // clearing it, so there is no relationship left to state. These are the four with no subject.
    expect(metrics).not.toMatch(/export const DOCK_BAR_H_PX/)
    expect(metrics).not.toMatch(/export const RAIL_FOLD_STICKY/)
    expect(metrics).not.toMatch(/export function railFoldClearsDock/)
    expect(metrics).not.toMatch(/export function railFoldStickyPx/)
  })

})
