import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ROLE IS DEFINED ABOVE. THIS HALF IS WHETHER ANYONE USES IT.
//
// Every assertion above this line reads `app/globals.css` and proves the DEFINITION is coherent:
// one size, one tracking, one weight, bridged into @theme. All seven passed on 2026-08-17 while
// the product rendered the eyebrow TEN different ways, because a definition nobody calls is not a
// role — it is a comment with a selector on it.
//
// So this block measures the other half, and it measures it where it is unambiguous. A slot the
// code itself calls `eyebrow` is the one population where nobody has to guess whether a small
// uppercase tracked label is "really" an eyebrow: the author already named it. On 2026-08-17 there
// were fifteen such slots and SEVEN of them hand-rolled the role — `text-2xs font-semibold
// uppercase tracking-wide` in EditorShell, `text-3xs font-bold uppercase tracking-wider` in Toast,
// `tracking-widest` in StudioWindow and SparkShell, `tracking-wide` in EntityHeader, JourneyBuilder
// and HostCohostSection — five different letter-spacings for one named role, none of them the
// role's own 0.18em, in the shared kit that every surface below inherits.
//
// WHAT COUNTS AS RESOLVING THE ROLE. Either the composite `eyebrow` utility (the whole role in one
// class) or the `tracking-eyebrow` token beside `uppercase`. The second form is admitted
// deliberately: the marketing register sets the same role at --text-body-sm over a photograph and
// reads the tracking token to do it, so demanding the composite class there would be a size change
// dressed up as a consistency fix. Both forms resolve to the token; a literal does not, and that is
// the line this test draws.
//
// WHAT THIS DELIBERATELY DOES NOT CLAIM. It does not say the ~615 unnamed hand-rolled sites are
// eyebrows — most of the population is pill badges and dense table headers, where 0.18em would blow
// the pill out, and sorting them is a per-site judgment. That population is held by the
// `handrolled-eyebrow` ratchet class in `scripts/adoption-baselines.json`, which can only shrink.
// This test owns the half a machine can settle: where the code says "eyebrow", the eyebrow role.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOTS = ['app', 'components'] as const

/** Every `.tsx` under `app/` + `components/`, tests excluded, as POSIX repo-relative paths. */
function tsxFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        if (name === 'node_modules' || name === '.next') continue
        walk(full)
        continue
      }
      if (!full.endsWith('.tsx') || /\.(test|spec)\.tsx$/.test(full)) continue
      out.push(relative(process.cwd(), full).split(sep).join('/'))
    }
  }
  for (const root of ROOTS) walk(join(process.cwd(), root))
  return out.sort()
}

/** An element whose ONLY child is the value the author named `eyebrow`, with its own class list. */
const EYEBROW_SLOT =
  /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})[^>]*>\s*\{\s*eyebrow\s*\}/g

/** The two forms that resolve the role through its tokens. Anything else is hand-rolled. */
const RESOLVES_ROLE = /(?:^|\s)eyebrow(?:\s|$)|\btracking-eyebrow\b/

function eyebrowSlots(): { file: string; classes: string }[] {
  const found: { file: string; classes: string }[] = []
  for (const file of tsxFiles()) {
    // Whitespace is collapsed so a slot split across lines by the formatter reads the same as an
    // inline one. Without it the gate would grade code by how Prettier happened to wrap it.
    const text = readFileSync(join(process.cwd(), file), 'utf8').replace(/\s+/g, ' ')
    EYEBROW_SLOT.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = EYEBROW_SLOT.exec(text)) !== null) {
      found.push({ file, classes: (m[1] ?? m[2] ?? m[3] ?? '').trim() })
    }
  }
  return found
}

describe('the eyebrow role is what a slot named `eyebrow` renders', () => {
  it('finds the slots at all — a green over an empty scan is the failure this guards', () => {
    // ADR-962: a gate that cannot see its own subject reads as coverage. If a refactor renames the
    // prop or changes the JSX shape, this fails LOUDLY instead of quietly passing over nothing.
    expect(eyebrowSlots().length).toBeGreaterThanOrEqual(10)
  })

  it('never hand-rolls the role in a slot the code itself calls an eyebrow', () => {
    const handRolled = eyebrowSlots()
      .filter((s) => /\buppercase\b/.test(s.classes) && !RESOLVES_ROLE.test(s.classes))
      .map((s) => `${s.file} — className="${s.classes}"`)

    // Named, not counted: the point of the message is that the fix is one class per line.
    expect(handRolled).toEqual([])
  })
})
