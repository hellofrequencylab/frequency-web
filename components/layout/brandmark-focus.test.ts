import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// ── THE FIRST TAB STOP MUST PAINT SOMETHING ──────────────────────────────────────────────────
//
// WHAT BROKE. app/globals.css carried an opt-out list against the global focus ring, and
// `.brandmark-link` was on it:
//
//     .brandmark-link:focus-visible { box-shadow: none; }
//
// The directive behind it was "the wordmark no longer paints a focus ring WHEN CLICKED". But
// `:focus-visible` is exactly the state a pointer click on a link does NOT enter — browsers
// reserve it for keyboard/assistive focus. So the rule did nothing whatsoever for the pointer
// complaint it was written for, and deleted the entire indicator for the case nobody raised:
//
//   • `BrandMark` is the in-app header wordmark, and app-shell.tsx renders it immediately after
//     the skip link — it is the FIRST visible tab stop on every signed-in page.
//   • The link's other affordances (`.brandmark-link:hover`, `:active`) are pointer-driven, so a
//     keyboard user tabbing into the app got no substitute indicator either. Nothing anywhere on
//     screen moved. That is a straight WCAG 2.4.7 failure on the very first stop.
//
// THE FIX IS A DELETION, NOT A NEW STYLE. The wordmark now falls through to the same generic
// `:where(button, a, …):focus-visible` ring every other control takes, drawn with the one
// `--color-focus-ring` token that scripts/check-contrast.mjs already measures. There is no
// bespoke wordmark focus style to keep in sync, and no second token to re-verify.
//
// WHY THIS IS A SOURCE TEST. `pnpm test` has no browser, so the honest thing a unit test can
// hold is the CASCADE FACT that produced the pixel: which selectors zero the indicator. Rather
// than grep for the one deleted line — a guard that passes by the absence of a string and would
// never notice the same suppression respelled — this enumerates EVERY `:focus-visible` rule in
// globals.css, classifies each as painting or suppressing, and pins the suppressing set to an
// explicit allowlist. A new opt-out for any surface, spelled any way, fails here until someone
// writes down why that surface still shows focus. The pixel half is the e2e a11y suite's job.

const ROOT = new URL('../../', import.meta.url).pathname
const read = (p: string) => readFileSync(ROOT + p, 'utf8')

const GLOBALS = read('app/globals.css')
const BRAND = read('components/layout/brand-mark.tsx')
const SHELL = read('components/layout/app-shell.tsx')

type Rule = { selector: string; body: string }

/** Every rule whose selector list mentions `:focus-visible`, comments stripped and whitespace
 *  collapsed so an assertion reads the same as the stylesheet. Brace-matched rather than
 *  regex-sliced so a nested/at-rule block cannot truncate a body and hide a declaration. */
function focusVisibleRules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Rule[] = []
  let cursor = 0
  for (;;) {
    const at = src.indexOf(':focus-visible', cursor)
    if (at === -1) break
    const open = src.indexOf('{', at)
    if (open === -1) break
    // The selector begins after whichever structural character last closed the previous rule.
    const start = Math.max(src.lastIndexOf('}', at), src.lastIndexOf('{', at), src.lastIndexOf(';', at)) + 1
    let depth = 0
    let end = open
    for (; end < src.length; end++) {
      if (src[end] === '{') depth++
      else if (src[end] === '}' && --depth === 0) break
    }
    out.push({
      selector: src.slice(start, open).trim().replace(/\s+/g, ' '),
      body: src.slice(open + 1, end).trim().replace(/\s+/g, ' '),
    })
    cursor = end + 1
  }
  return out
}

/** A rule SUPPRESSES focus when it lands on a focus-visible selector and paints no indicator:
 *  either it zeroes the ring outright, or it kills the native outline without replacing it. */
function suppressesFocus({ body }: Rule): boolean {
  const zeroesRing = /box-shadow:\s*none/.test(body)
  const paintsRing = /box-shadow:\s*(?!none)[^;]+/.test(body)
  const killsOutline = /outline:\s*(none|0)\b/.test(body)
  return zeroesRing || (killsOutline && !paintsRing)
}

/** The ONLY surfaces allowed to opt out, each because it still shows focus some other way.
 *  Adding a row here is a deliberate accessibility argument, which is the point of the list. */
const ALLOWED_OPT_OUTS = [
  // The Composer textarea: its wrapper lifts on :focus-within, so the box itself is the
  // indicator and a hard ring on the field doubled up.
  ':where([data-tour-anchor="composer"]) textarea:focus-visible',
  // The admin command-bar search field: borderless on a canvas band; the caret shows focus.
  '.admin-search-field:focus-visible',
]

const RULES = focusVisibleRules(GLOBALS)

describe('the parse actually sees the stylesheet it is asserting about', () => {
  it('finds the generic rules, so an empty result cannot pass by accident', () => {
    expect(RULES.length).toBeGreaterThanOrEqual(3)
    expect(RULES.filter((r) => !suppressesFocus(r)).length).toBeGreaterThanOrEqual(2)
  })

  it('classifies a painting rule and a zeroing rule apart', () => {
    expect(suppressesFocus({ selector: 'a:focus-visible', body: 'outline: none; box-shadow: 0 0 0 3px var(--color-focus-ring);' })).toBe(false)
    expect(suppressesFocus({ selector: 'a:focus-visible', body: 'box-shadow: none;' })).toBe(true)
    expect(suppressesFocus({ selector: 'a:focus-visible', body: 'outline: none;' })).toBe(true)
  })
})

describe('every keyboard focus stop paints an indicator', () => {
  it('the generic link/button ring is drawn with the shared focus token', () => {
    const generic = RULES.find((r) => r.selector.startsWith(':where(button, a,'))
    expect(generic, 'globals.css no longer declares the generic control focus ring').toBeDefined()
    expect(generic!.body).toContain('box-shadow: 0 0 0 3px var(--color-focus-ring)')
  })

  it('only the documented surfaces opt out of it', () => {
    const suppressed = RULES.filter(suppressesFocus).map((r) => r.selector)
    expect(
      suppressed,
      `a :focus-visible rule paints no indicator and is not on the allowlist:\n${suppressed
        .filter((s) => !ALLOWED_OPT_OUTS.includes(s))
        .join('\n')}\nEither give the surface a visible focus affordance or justify it in ALLOWED_OPT_OUTS.`,
    ).toEqual(ALLOWED_OPT_OUTS)
  })

  it('nothing suppresses focus on the header wordmark — the first tab stop in the app', () => {
    // Stated separately from the allowlist so the failure names the regression rather than a diff.
    const onWordmark = RULES.filter(suppressesFocus).filter((r) => /brandmark/.test(r.selector))
    expect(
      onWordmark.map((r) => `${r.selector} { ${r.body} }`),
      'the in-app wordmark is the first tab stop after the skip link; it cannot be the one link that paints nothing',
    ).toEqual([])
  })
})

describe('the wordmark is reached by that generic rule, not by a style of its own', () => {
  it('renders as a real <a> carrying .brandmark-link', () => {
    // `next/link` renders an anchor, which is what `:where(… a …):focus-visible` matches. If the
    // wordmark ever became a <div role="link"> the generic ring would stop reaching it.
    expect(BRAND).toContain("import Link from 'next/link'")
    expect(BRAND).toContain('brandmark-link')
  })

  it('declares no bespoke focus styling that could drift from the token', () => {
    expect(BRAND).not.toMatch(/focus-visible:|focus:outline-none|outline-none|shadow-none/)
    // The `.brandmark-link` block in globals.css styles idle/hover/press only. Comments are
    // stripped first: globals.css explains this very deletion in prose beside the rules, and a
    // guard that trips on its own documentation is a guard the next reader deletes.
    const brandBlocks = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, '').match(/\.brandmark-link[^{}]*\{[^}]*\}/g) ?? []
    expect(brandBlocks.length).toBeGreaterThan(0)
    expect(brandBlocks.filter((b) => b.includes(':focus'))).toEqual([])
  })

  it('sits immediately after the skip link, which is why this matters', () => {
    const skip = SHELL.indexOf('Skip to content')
    const mark = SHELL.indexOf('<BrandMark')
    expect(skip).toBeGreaterThan(-1)
    expect(mark).toBeGreaterThan(skip)
  })
})
