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

describe('the fold control is ON its tab, so the clearance problem cannot come back', () => {
  const metrics = readFileSync(join(process.cwd(), 'lib/layout/shell-metrics.ts'), 'utf8')
  const control = readFileSync(join(process.cwd(), 'components/layout/rail-fold-control.tsx'), 'utf8')

  it('no rail pins a control above the dock bar any more', () => {
    // 🔴 WHAT THIS REPLACES. The control was `sticky` at the rail's foot and DockBar is `fixed
    // bottom-0` ~52px tall; sticky offsets do not stack against a fixed SIBLING, so it shipped
    // at `bottom-4` — inside the bar, invisible and unclickable — and had to be re-pinned to
    // `bottom-14` and held there by constants. The control is a tick on the tab's own corner now
    // (owner, 2026-08-05), which is back in that corner but not as a sibling.
    expect(shell).not.toContain('sticky bottom-14')
    expect(shell).not.toContain('sticky bottom-6')
    expect(shell).not.toContain('sticky bottom-4')
    // And there is exactly ONE control per rail. No predecessor left beside the tick.
    expect(shell).not.toContain('<RailFoldControl')
    expect(shell).not.toContain('RailEdgeHandle')
  })

  it('🔴 the tick is a CHILD of the tab, which is what makes the constants unnecessary', () => {
    // This is the load-bearing claim, so it is asserted rather than argued. A clearance constant
    // is only needed between two INDEPENDENTLY POSITIONED boxes. The tick is positioned against
    // the tab itself — `absolute` inside the account dock (`sticky bottom-0`) and inside DockBar
    // (`fixed bottom-0`), both of which are already containing blocks. It therefore travels with
    // the tab through every state the old control had to dodge: the Vault panel unfurling, the
    // profile dock's quick actions rising, the bar riding up to meet the rail's end.
    expect(control).toContain('absolute')
    // Its parent in the shell is the account dock's own box, immediately after that box opens.
    expect(shell).toContain('bg-chrome/95 px-2 pt-1 backdrop-blur-sm">\n                  {/* The LEFT rail')
    expect(shell).toContain('<RailFoldTick\n                    side="left"')
    // Its parent on the right is the bar, which is `fixed bottom-0`.
    const dock = readFileSync(join(process.cwd(), 'components/layout/dock-bar.tsx'), 'utf8')
    expect(dock).toContain('<RailFoldTick')
    expect(dock).toContain('pointer-events-none fixed bottom-0')
  })

  it('the clearance constants STAY deleted — nothing here needs them back', () => {
    // A constant that names a relationship between two things that no longer meet reads as a
    // live constraint to the next person. The tick shares a box with the bar rather than
    // clearing it, so there is no relationship left to state. These are the four with no subject.
    expect(metrics).not.toMatch(/export const DOCK_BAR_H_PX/)
    expect(metrics).not.toMatch(/export const RAIL_FOLD_STICKY/)
    expect(metrics).not.toMatch(/export function railFoldClearsDock/)
    expect(metrics).not.toMatch(/export function railFoldStickyPx/)
  })

  it('the rail-end sentinel is now simply LAST in the rail', () => {
    // It used to have to be ordered after the foot control, because the control was rail content
    // and a sentinel above it told the bar the rail ended one control early. The fold control is
    // not rail content at all now, so "last" is the whole rule again.
    expect(shell).toContain(
      '<div id={RAIL_END_SENTINEL_ID} aria-hidden className="h-0" />\n                  </aside>',
    )
  })

  it('and it lives ONLY in the open rail, which is what makes the fold inert', () => {
    // The sentinel is the sole source of `atRailEnd`, which is the sole trigger for the Vault's
    // rail-end auto-open. A folded rail has no sentinel, so a folded rail cannot auto-open a
    // Vault that is not on screen — no guard, no flag, nothing to keep in sync.
    expect(shell.match(/id=\{RAIL_END_SENTINEL_ID\}/g)?.length).toBe(1)
  })
})
