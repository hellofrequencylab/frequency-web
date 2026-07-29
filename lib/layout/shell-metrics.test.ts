import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  LEFT_RAIL,
  RIGHT_RAIL,
  RIGHT_RAIL_ML,
  GAP,
  GAP_LG,
  RAILS_MD,
  RAILS_LG,
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

  it('the right rail is still 288px and still hides below lg', () => {
    // Its width is an INLINE STYLE, not a class — easy to miss when reading for `w-*`.
    expect(shell).toContain('railCollapsed ? 56 : 288')
    expect(RIGHT_RAIL).toBe(18) // 288px = 18rem
    expect(shell).toContain('lg:ml-3')
    expect(RIGHT_RAIL_ML).toBe(0.75) // ml-3
  })

  it('the row gaps are still gap-8 / lg:gap-10', () => {
    expect(shell).toContain('gap-8 lg:gap-10')
    expect(GAP).toBe(2)
    expect(GAP_LG).toBe(2.5)
  })

  it('the derived totals are arithmetically right', () => {
    expect(RAILS_MD).toBe(14) // 12 + 2
    expect(RAILS_LG).toBe(35.75) // 12 + 2.5 + 18 + 0.75 + 2.5
  })
})

describe('the class string states those totals LITERALLY', () => {
  it('carries the computed rem values', () => {
    // ⚠️ Tailwind generates utilities by scanning source text for whole class strings. An
    // interpolated `max-w-[calc(100%-${RAILS_MD}rem)]` would be correct at runtime and produce NO
    // CSS at build time, silently collapsing the column back to full width — the exact bug this
    // module exists to end. So the literals are asserted against the numbers.
    expect(SHELL_CONTENT_WIDTH_CLASS).toContain(`md:max-w-[calc(100%-${RAILS_MD}rem)]`)
    expect(SHELL_CONTENT_WIDTH_CLASS).toContain(`lg:max-w-[calc(100%-${RAILS_LG}rem)]`)
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

  it('nests the column inside the row box, at all three call sites', () => {
    // The `100%` in the calc is the ROW's inner width. Used without that wrapper it resolves
    // against whatever ancestor happens to be there and the width is meaningless.
    expect(code.match(/className=\{CLAIM_ROW\}/g)?.length).toBe(3)
    expect(code.match(/CLAIM_COLUMN/g)?.length).toBe(4) // 1 definition + 3 uses
  })
})
