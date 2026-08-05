import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LEFT_RAIL,
  RIGHT_RAIL_PX,
  RIGHT_RAIL_ML,
  GAP,
  GAP_LG,
  RAILS_MD,
  RAILS_LG_REM,
  RAIL_STRIP_CLASS,
  SHELL_ROW_CLASS,
  SHELL_CONTENT_WIDTH_CLASS,
  DOCK_BAR_H_PX,
  RAIL_FOLD_STICKY_CLASS,
  RAIL_FOLD_STICKY_PX,
  railFoldClearsDock,
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

const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')

describe('the root font size is not 16px, which is why units matter here', () => {
  it('globals.css sets a non-default root, so rem != 16px', () => {
    // The whole unit bug lived here. If this ever returns to 100%, the old conversion would
    // coincidentally start working and someone might "simplify" the mixed-unit calc back.
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toContain('font-size: var(--density-root, 106.25%)')
  })
})

describe('the numbers still match the shell', () => {
  it('the row max width and padding are the shell row', () => {
    expect(shell).toContain('max-w-[105rem]')
    expect(SHELL_ROW_CLASS).toContain('max-w-[105rem]')
    // Same responsive padding scale, or the inner calc resolves against a different box.
    expect(shell).toContain('px-4 sm:px-6 lg:px-8')
    expect(SHELL_ROW_CLASS).toContain('px-4 sm:px-6 lg:px-8')
  })

  it('the left rail is still w-48 and still hides below md', () => {
    expect(shell).toContain('hidden md:flex w-48 shrink-0')
    expect(LEFT_RAIL).toBe(12) // w-48 = 12rem
  })

  it('a FOLDED rail is a w-14 strip on both sides, and the claim page ignores it', () => {
    // The fold ladder (lib/layout/rail-fold.ts) gave the LEFT rail a desktop fold too, so the left
    // column is now conditional. The claim page still derives from the OPEN widths: the fold is a
    // per-viewer standing instruction, and the claim page has neither rails nor a viewer to read
    // one from. Both strips use the same class step.
    expect(shell).toContain(`hidden md:flex ${RAIL_STRIP_CLASS} shrink-0`) // left, folded
    expect(shell).toContain(`flex ${RAIL_STRIP_CLASS} shrink-0 flex-col items-center`) // right, folded
    // ⚠️ The right rail's COLUMN still carries an inline `56`, which is NOT what `w-14` computes
    // to at a 17px root (3.5rem = 59.5px). That predates the fold ladder and is left alone here —
    // asserted so the discrepancy is on the record rather than quietly "corrected" into a number
    // this file would then be wrong about (see the RIGHT_RAIL_PX warning above).
    expect(shell).toContain('railCollapsed ? 56 : 288')
    // Whatever those strips are, they are not in the claim page's arithmetic.
    expect(SHELL_CONTENT_WIDTH_CLASS).not.toContain('56')
  })

  it('the right rail is still 288px and still hides below lg', () => {
    // Its width is an INLINE STYLE, not a class — easy to miss when reading for `w-*`.
    expect(shell).toContain('railCollapsed ? 56 : 288')
    // 🔴 PIXELS, not rem. This app sets html{font-size:106.25%} so the root is 17px, and the
    // original `18 // rem` conversion (correct only at 16px/rem) made the claim column 18px too
    // narrow at lg — while THIS test, asserting 18, stayed green. Keeping the unit is what fixes it.
    expect(RIGHT_RAIL_PX).toBe(288)
    expect(shell).toContain('lg:ml-3')
    expect(RIGHT_RAIL_ML).toBe(0.75) // ml-3
  })

  it('the row gaps are still gap-8 / lg:gap-10', () => {
    expect(shell).toContain('gap-8 lg:gap-10')
    expect(GAP).toBe(2)
    expect(GAP_LG).toBe(2.5)
  })

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

  it('imports the shared geometry', () => {
    expect(code).toContain("from '@/lib/layout/shell-metrics'")
    expect(code).toContain('SHELL_ROW_CLASS')
    expect(code).toContain('SHELL_CONTENT_WIDTH_CLASS')
  })

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

describe('right rail fold control vs the dock bar', () => {
  it('clears the bar rather than hiding behind it', () => {
    // The defect this pins: `sticky bottom-4` (17px) inside a rail whose bottom-right corner is
    // covered by a `fixed bottom-0` bar ~48px tall. Sticky and fixed resolve against different
    // containing blocks, so they never stack — the control was simply underneath.
    expect(railFoldClearsDock()).toBe(true)
    expect(RAIL_FOLD_STICKY_PX).toBeGreaterThan(DOCK_BAR_H_PX)
  })

  it('spells the offset the same way in the shell as in the constant', () => {
    const shell = readFileSync(
      join(process.cwd(), 'components/layout/app-shell.tsx'),
      'utf8',
    )
    // A class string, because Tailwind generates utilities by scanning source text. If someone
    // retunes the constant without retuning the class, the layout silently reverts and only this
    // assertion notices.
    expect(shell).toContain(`sticky ${RAIL_FOLD_STICKY_CLASS} mt-2 flex justify-end`)
  })

  it('puts the rail-end sentinel after the fold control, not before it', () => {
    const shell = readFileSync(
      join(process.cwd(), 'components/layout/app-shell.tsx'),
      'utf8',
    )
    const control = shell.indexOf(`sticky ${RAIL_FOLD_STICKY_CLASS} mt-2 flex justify-end`)
    const sentinel = shell.indexOf('id={RAIL_END_SENTINEL_ID}')
    expect(control).toBeGreaterThan(-1)
    expect(sentinel).toBeGreaterThan(-1)
    // The control is the last thing IN the rail, so the ruler that marks the rail's end belongs
    // after it. Above it, the bar is told the rail ends one control early and comes to rest on
    // top of the affordance it should be resting under.
    expect(sentinel).toBeGreaterThan(control)
  })
})
