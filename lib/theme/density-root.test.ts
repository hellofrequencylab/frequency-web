import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { GENERATIONS } from './generations'

// ── THE DENSITY AXIS HAS TO REACH <html>, AND FOR MONTHS IT DID NOT ──────────────────────────
//
// `--density-root` is the one feel token whose ONLY consumer is the root element itself:
//
//     html { font-size: var(--density-root, 106.25%); }
//
// `rem` resolves against <html> and nothing else, and CSS custom properties inherit DOWNWARD only.
// `[data-generation]` lived exclusively on a div inside <body>, so <html> never saw the preset's
// value and every one of the eight presets fell through to the 106.25% fallback.
//
// ⚠️ AN EARLIER VERSION OF THIS COMMENT SAID DENSITY WAS THE ONLY AXIS AFFECTED. It was wrong, and
// the correction is worth more than the original claim. `--type-scale` had the SAME defect by a
// different route: the eighteen `--text-*` role tokens are declared INSIDE the `:root` block as
// `calc(… * var(--type-scale, 1))`, and a `var()` inside a custom property is substituted on the
// element where it is DECLARED — <html> — with descendants inheriting the already-computed number.
// So while `[data-generation]` sat only on the shell div, every role token was pinned at 1.0 under
// all eight presets too. The only part of the type axis that worked was `text-scaled-*`, which
// resolves at the element and has six call sites in the repo, against `text-body` and its siblings
// everywhere. The stamp below repairs both; `lib/theme/type-scale-root.test.ts` pins that half.
//
// `--radius-*`, `--motion-*`, `--ornament` and `--tap-min` really are read at the element, so those
// were live all along.
//
// The failure was completely silent. Nothing threw. Nothing overflowed. The Theme Studio kept
// offering a Density control (components/admin/theme-studio/tokens.ts) bound to a token no rule
// could read, and the presets still LOOKED different because their type scale, radii and motion
// were all working — so "the spacious preset is airier" was true enough to stop anyone checking
// whether the part that sets global density had ever done anything.
//
// This file pins the three facts that have to stay true together. Any one of them alone is a
// working-looking system with a dead axis, which is exactly the state it was found in:
//
//   1. the presets still DECLARE the token (otherwise there is nothing to carry),
//   2. <html> still READS it (otherwise carrying it is pointless), and
//   3. the resolved generation is STAMPED on <html> (otherwise the read cannot see the declaration).
//
// Source assertions, because the defect is a cascade fact and `pnpm test` has no browser. The
// pixel half belongs to the e2e suite; what a unit test can honestly hold is the wiring.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

const CSS = read('../../app/globals.css')
const MAIN_LAYOUT = read('../../app/(main)/layout.tsx')
const SHELL = read('../../components/layout/app-shell.tsx')

describe('the presets declare a density', () => {
  // `balanced` is the documented no-op anchor: it inherits the base 106.25% on purpose and its
  // block is explicitly marked "do NOT add overrides here". Every other preset has to move the
  // number or its density axis says nothing.
  const withDensity = GENERATIONS.filter((g) => g.id !== 'balanced')

  it.each(withDensity.map((g) => g.id))('%s sets --density-root in its block', (id) => {
    const block = CSS.match(new RegExp(`\\[data-generation="${id}"\\]\\s*\\{([\\s\\S]*?)\\}`))
    expect(block, `no [data-generation="${id}"] block in app/globals.css`).toBeTruthy()
    expect(block![1]).toMatch(/--density-root:\s*[\d.]+%/)
  })

  it('leaves the balanced anchor alone', () => {
    const block = CSS.match(/\[data-generation="balanced"\]\s*\{([\s\S]*?)\}/)
    expect(block![1]).not.toContain('--density-root')
  })
})

describe('the root element reads it', () => {
  it('still drives the root font-size off the token', () => {
    expect(CSS).toMatch(/html\s*\{[\s\S]*?font-size:\s*var\(--density-root, 106\.25%\)/)
  })
})

describe('the resolved generation reaches the root element', () => {
  // The stamp lives in the (main) layout and NOT in app/layout.tsx on purpose: that file's own
  // comment records that the per-request cookie + DB-theme reads are kept out of the root layout
  // so public marketing and /discover pages stay static. Moving the resolution up to <html>'s own
  // layout would make every public page dynamic to fix a member-only axis.
  it('stamps data-generation onto documentElement from the member layout', () => {
    expect(MAIN_LAYOUT).toContain(
      "document.documentElement.setAttribute('data-generation',",
    )
  })

  it('stamps the RESOLVED value, not a literal', () => {
    expect(MAIN_LAYOUT).toContain('JSON.stringify(theme.generation)')
  })

  it('does not resolve the theme in the root layout (that would de-static the public site)', () => {
    expect(read('../../app/layout.tsx')).not.toContain('resolveTheme')
  })

  it('keeps the shell root attribute too, so the tokens still scope to the shell', () => {
    expect(SHELL).toContain('data-generation={generation}')
  })
})
