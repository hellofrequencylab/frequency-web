import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// THE EYEBROW ROLE, GUARDED.
//
// The eyebrow is the small uppercase tracked label above a heading, and until 2026-08-05 the
// product had two answers for how big it is: the `eyebrow` utility read `--text-meta`
// (0.75rem) while the `--text-eyebrow` token — declared, bridged, and therefore a real
// `text-eyebrow` utility — said 0.875rem. Whichever you got depended on which class you
// happened to write. Nothing failed; the two just disagreed by 17%.
//
// DAWN is the source of that split and carries it still (tokens/typography.css declares
// 0.875rem while its own .eyebrow class reads --text-meta), plus a second one on tracking
// (readme §4 says "locked at 0.25em"; the token says 0.18em, and the class reads the token).
// Both are resolved here and sent back as outbound feedback.
//
// This test reads globals.css from disk — the same pattern the skin/generation/occasion
// registry tests use — because the failure mode is not a type error or a render bug. It is
// two declarations quietly drifting apart, which only a comparison can see.

const CSS = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8')

/** The `:root` declaration for a token, comments stripped first.
 *  Stripping matters: globals.css documents itself and names its own tokens in prose, and
 *  a scan that skips this step reads the documentation as if it were the declaration. */
function declaration(token: string): string {
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  const match = withoutComments.match(new RegExp(`${token}\\s*:\\s*([^;]+);`))
  return match ? match[1].trim().replace(/\s+/g, ' ') : ''
}

/** The body of an `@utility <name> { … }` block, comments stripped. */
function utilityBody(name: string): string {
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  const match = withoutComments.match(new RegExp(`@utility\\s+${name}\\s*\\{([^}]*)\\}`))
  return match ? match[1] : ''
}

describe('the eyebrow role has one answer', () => {
  it('sizes at 0.75rem — the content floor, not body size', () => {
    // 0.875rem is --text-body-sm. An eyebrow set at body size stops labelling the sentence
    // beneath it and starts competing with it.
    expect(declaration('--text-eyebrow')).toBe('calc(0.75rem * var(--type-scale, 1))')
  })

  it('tracks at 0.18em', () => {
    // Uppercase at this size wants roughly +0.05em to +0.20em. Past that the letters space
    // faster than the words do, and a two-word label reads as two labels.
    expect(declaration('--tracking-eyebrow')).toBe('0.18em')
  })

  it('carries its own line-height ratio, paired to its own size', () => {
    // A `text-*` utility emits BOTH font-size and line-height, so a role whose size moves
    // without its ratio silently inherits a leading meant for a different size.
    expect(declaration('--text-eyebrow--line-height')).toBe('calc(1 / 0.75)')
  })

  it('drives the `eyebrow` utility from the role token, not a borrowed one', () => {
    // The whole defect was the utility reading --text-meta. Same rendered value, but it
    // meant the role did not own its own size, so moving one never moved the other.
    const body = utilityBody('eyebrow')
    expect(body).toContain('font-size: var(--text-eyebrow)')
    expect(body).not.toContain('var(--text-meta)')
    expect(body).toContain('letter-spacing: var(--tracking-eyebrow)')
    expect(body).toContain('text-transform: uppercase')
  })

  it('is bold, so the one class is the whole role', () => {
    // DAWN's readme says "uppercase, bold" while its own class says semibold — the third
    // disagreement about this single role. Production had already voted 26 bold / 4 black
    // against 1 semibold. Tracking thins a word optically, so at 12.75px a semibold eyebrow
    // reads underweight beside the heading it introduces.
    // The point of asserting it: `eyebrow` must be sufficient ALONE. The moment it needs a
    // `font-bold` beside it to look right, every call site is hand-rolling the role again,
    // which is the habit this whole utility exists to end.
    expect(utilityBody('eyebrow')).toContain('font-weight: var(--weight-bold)')
  })

  it('keeps the size token and the utility in agreement', () => {
    // The regression this file exists to catch: someone retunes --text-eyebrow for the
    // `text-eyebrow` utility and never notices `eyebrow` still points somewhere else.
    const eyebrowSize = declaration('--text-eyebrow')
    const metaSize = declaration('--text-meta')
    expect(utilityBody('eyebrow')).toContain('var(--text-eyebrow)')
    // They happen to be equal today. That is a coincidence of value, not of meaning, and
    // the utility must follow the ROLE token if they ever diverge.
    expect(eyebrowSize).toBe(metaSize)
  })

  it('is bridged into @theme, or the utility would be dead text', () => {
    // Tailwind generates utilities from @theme, not :root. A role declared only in :root
    // whose name Tailwind also ships gets painted with TAILWIND's value while the designed
    // one sits there looking correct. That is what check:bridge exists for.
    const themeBlock = CSS.slice(CSS.indexOf('@theme inline'))
    expect(themeBlock).toContain('--text-eyebrow:')
    expect(themeBlock).toContain('--tracking-eyebrow:')
    expect(themeBlock).toContain('--text-eyebrow--line-height:')
  })
})
