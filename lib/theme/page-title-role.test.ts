import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// THE FLUID PAGE-TITLE ROLE, GUARDED (ADR-949).
//
// `--text-page-title-lg` is the only role in the vocabulary that exists to retire a RESPONSIVE
// RAMP rather than a single literal. Two sites carried `text-page-title sm:text-3xl lg:text-4xl`
// — 1.5 / 1.875 / 2.25rem in two jumps — and stayed on literals through ADR-947 because every
// fixed role is one size by definition and the nearest fluid one (`display-h3`) floors at
// 1.75rem in an Anton display face. The role interpolates the SAME floor and the SAME ceiling.
//
// Three things can silently undo that, and none of them is a type error or a render bug, which
// is why they are pinned here by reading the files:
//
//   1. The clamp bounds drifting off the ramp they reproduce — the floor is the phone rendering
//      that must not move, the ceiling is the desktop one.
//   2. The role declared in `:root` and not bridged into `@theme inline`. Tailwind v4 generates
//      utilities from `@theme`, so that combination reads perfectly and emits NOTHING. There is
//      no Tailwind default under this name to mask it with a wrong-but-present value.
//   3. Half of the mirrored pair being converted. DetailTemplate's `titleScale="display"` h1 and
//      the event page's inline-edit input must name the SAME role: a browser gives form controls
//      their own font, so the input cannot inherit the h1 it sits inside. Convert one and the
//      editor stops matching the title it edits.

const root = process.cwd()
const CSS = readFileSync(join(root, 'app', 'globals.css'), 'utf8')

/** Blank `/* … *\/` and line-opening `//` comments.
 *  Load-bearing, not hygiene: globals.css documents its own tokens in prose and the two consumer
 *  files quote the retired ramp verbatim in their comments. A scan that skips this step reads the
 *  documentation of a thing as the thing. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\n)([ \t]*\/\/[^\n]*)/g, '$1')
}

/** Slice a top-level block by its prelude, brace-counting so nested rules do not end it early. */
function blockBody(css: string, prelude: RegExp): string {
  const hit = prelude.exec(css)
  if (!hit) return ''
  const open = css.indexOf('{', hit.index)
  if (open === -1) return ''
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  return ''
}

const BARE = stripComments(CSS)
const THEME = blockBody(BARE, /@theme\b/)
/** Everything outside `@theme` — the `:root` declarations plus every skin/generation override. */
const OUTSIDE = BARE.replace(THEME, '')

/** The value assigned to `token` in a block, whitespace collapsed. The trailing `\s*:` is what
 *  keeps `--text-page-title` from matching `--text-page-title-lg`'s declaration. */
function valueIn(block: string, token: string): string {
  const m = block.match(new RegExp(`${token}\\s*:\\s*([^;]+);`))
  return m ? m[1].trim().replace(/\s+/g, ' ') : ''
}

const source = (p: string) => stripComments(readFileSync(join(root, p), 'utf8'))
const DETAIL = source('components/templates/detail-template.tsx')
const EVENT = source('app/(main)/events/[slug]/page.tsx')
const PRICING = source('app/(marketing)/pricing/page.tsx')

describe('--text-page-title-lg reproduces the ramp it retired', () => {
  it('is a clamp on the generation axis, not a bare clamp', () => {
    // The `* var(--type-scale, 1)` wrapper is the whole point of the vocabulary: a clamp declared
    // outside it would be the one role the bold/kids presets could not resize.
    expect(valueIn(OUTSIDE, '--text-page-title-lg')).toBe(
      'calc(clamp(1.5rem, 4vw, 2.25rem) * var(--type-scale, 1))',
    )
  })

  it('floors exactly where the ramp floored — at the fixed page title', () => {
    // Below `sm` the ramp painted `text-page-title`. Same number here means the phone rendering,
    // the one the floor exists to protect, did not move when the ramp was retired.
    const fixed = valueIn(OUTSIDE, '--text-page-title')
    expect(fixed).toContain('1.5rem')
    expect(valueIn(OUTSIDE, '--text-page-title-lg')).toContain('clamp(1.5rem,')
  })

  it('ceilings exactly where the ramp ceilinged — 2.25rem, the same top as display-h3', () => {
    expect(valueIn(OUTSIDE, '--text-page-title-lg')).toContain(', 2.25rem)')
    expect(valueIn(OUTSIDE, '--text-display-h3')).toContain(', 2.25rem)')
  })

  it('carries the line-height of the literal at its CEILING, like every other role here', () => {
    // The ramp topped out at text-4xl, so desktop leading is unchanged and SIZE is the only
    // thing the conversion moved. Missing this pairing drops the leading to the body's 1.5.
    expect(valueIn(OUTSIDE, '--text-page-title-lg--line-height')).toBe('calc(2.5 / 2.25)')
    expect(valueIn(OUTSIDE, '--text-stat-md--line-height')).toBe('calc(2.5 / 2.25)')
  })

  it('is bridged into @theme inline, size AND line-height, or the utility emits nothing', () => {
    expect(valueIn(THEME, '--text-page-title-lg')).toBe('var(--text-page-title-lg)')
    expect(valueIn(THEME, '--text-page-title-lg--line-height')).toBe(
      'var(--text-page-title-lg--line-height)',
    )
  })

  it('is asserted in the phantom-class gate, which is what proves the class exists', () => {
    // The gate is otherwise consumer-driven, so a role with no call site is invisible to it.
    const gate = readFileSync(join(root, 'scripts', 'check-phantom-classes.mjs'), 'utf8')
    expect(gate).toContain("'text-page-title-lg'")
  })
})

describe('the mirrored pair moved together', () => {
  it('DetailTemplate’s display title is the single role, not the ramp', () => {
    expect(DETAIL).toContain("titleScale === 'display' ? 'text-page-title-lg'")
    expect(DETAIL).not.toContain('sm:text-3xl')
    expect(DETAIL).not.toContain('lg:text-4xl')
  })

  it('the event page’s inline-edit input names the SAME role', () => {
    // 🔴 The coupling is smaller after ADR-949 (one token instead of three classes across two
    // breakpoints) but it is NOT gone, and this is the assertion that holds it: an <input> gets
    // the browser's own form-control font and cannot inherit the h1 it sits in.
    expect(EVENT).toContain('text-page-title-lg font-bold text-text')
    expect(EVENT).not.toContain('sm:text-3xl')
    expect(EVENT).not.toContain('lg:text-4xl')
  })
})

describe('pricing sizeFor() stays a fitting algorithm', () => {
  it('keeps four length-driven branches', () => {
    // ADR-947: this is not four stray literals, it is a fitting algorithm — four sizes chosen by
    // label character count so the display face never wraps mid-figure. Collapsing it to one role
    // is the failure this pins, in either direction.
    expect(PRICING).toContain('const long = label.length > 8')
    expect(PRICING).toContain("'text-stat-sm sm:text-stat-md'")
    expect(PRICING).toContain("'text-stat-sm'")
    expect(PRICING).toContain("'text-stat-md'")
  })

  it('leaves the featured/short branch on literals, because no role reaches 3rem/3.75rem', () => {
    // `stat-md` ends at 2.25rem and the hero `stat` starts at a 3.5rem floor; `page-title-lg`
    // CEILINGS at 2.25rem, i.e. where this branch begins. Nothing covers it.
    expect(PRICING).toContain("'text-5xl sm:text-6xl'")
    expect(valueIn(OUTSIDE, '--text-stat')).toContain('clamp(3.5rem')
  })
})
