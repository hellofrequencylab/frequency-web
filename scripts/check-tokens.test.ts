import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  tokenViolations,
  runCheck,
  paletteViolations,
  themeSites,
  cssThemeSites,
  tsxThemeSites,
  cssDeclarations,
  isGeneratedCss,
  scanTheme,
  tally,
  compareTheme,
  mergeTheme,
  loadThemeBaseline,
  lineIndex,
  RATCHET_KINDS,
} from './check-tokens.mjs'

// Self-test for the token guard. Written after an audit found three ways it read green while real
// literals sat in the tree, all of the same species: the gate was measuring a narrower thing than
// its success message claimed.

const kinds = (src: string, path = 'components/x.tsx') =>
  (tokenViolations(path, src) as { kind: string; match: string }[]).map((v) => v.match)

describe('arbitrary type size — every unit, not just px', () => {
  // The regex was /text-\[\d+px\]/, so the canon's ban on arbitrary content type could be
  // sidestepped by writing the same size in another unit. Two live sites did exactly that.
  it('catches px, rem, em, pt', () => {
    expect(kinds('<p className="text-[10px]" />')).toEqual(['text-[10px]'])
    expect(kinds('<p className="text-[0.7rem]" />')).toEqual(['text-[0.7rem]'])
    expect(kinds('<p className="text-[0.85em]" />')).toEqual(['text-[0.85em]'])
    expect(kinds('<p className="text-[9pt]" />')).toEqual(['text-[9pt]'])
  })

  it('leaves clamp() alone — fluid DISPLAY sizing is a different class the canon does not ban', () => {
    expect(kinds('<h1 className="text-[clamp(2rem,5vw,4rem)]" />')).toEqual([])
  })

  it('leaves a var() or a named role alone', () => {
    expect(kinds('<p className="text-[var(--text-body)] text-3xs text-body-sm" />')).toEqual([])
  })
})

describe('counting occurrences, not lines', () => {
  // `code.match(re)` without /g returns only the FIRST match, so two literals on one line counted
  // as one. A gate that undercounts reports progress it did not make.
  it('reports both literals when two sit on the same line', () => {
    expect(kinds('<a style={{ color: "#AABBCC", background: "#112233" }} />')).toEqual([
      '#AABBCC',
      '#112233',
    ])
  })

  it('reports two arbitrary type sizes on one line', () => {
    const found = kinds('<p className="text-[10px] sm:text-[12px]" />')
    expect(found).toEqual(['text-[10px]', 'text-[12px]'])
  })

  it('does not leak regex lastIndex between files (the /g state trap)', () => {
    // A /g regex carries lastIndex across .matchAll calls if the same object is reused wrongly.
    // Two identical scans must give identical results; a leak makes the second one come back short.
    const src = '<a style={{ color: "#AABBCC" }} />'
    expect(kinds(src)).toEqual(kinds(src))
  })
})

describe('a file-level waiver must not waive classes nobody exempted', () => {
  // induction.tsx was allowlisted for a 4-hex Google brand mark, and the exemption silently
  // covered its arbitrary type as well. Scoped entries are the fix.
  const INDUCTION = 'app/join/(induction)/induction.tsx'

  it('still exempts the hex palette it was granted for', () => {
    expect(kinds('const g = "#4285F4"', INDUCTION)).toEqual([])
  })

  it('no longer exempts arbitrary type in the same file', () => {
    expect(kinds('<p className="text-[10px]" />', INDUCTION)).toEqual(['text-[10px]'])
  })

  it('a bare (unscoped) allowlist entry still exempts everything', () => {
    // app/print/ is unscoped on purpose: a print document renders literal CSS, not the cascade.
    expect(kinds('<p className="text-[10px]" style={{ color: "#123456" }} />', 'app/print/qr/page.tsx')).toEqual([])
  })
})

describe('the tree is clean under the tightened rules', () => {
  // A whole-tree scan: give it room on a loaded machine rather than a flaky 30s default.
  it('runCheck finds no violations', () => {
    expect(runCheck()).toEqual([])
  }, 120_000)
})

describe('HYG-099: leftover hex is enumerated, not ungoverned', () => {
  // The survey close condition was "remaining hex at zero, OR an allowlist is named".
  // Raster OG and map paints are the named leftover craft; in-app chrome is still gated.
  it('Satori OG cards may carry hex because they cannot read CSS tokens', () => {
    expect(kinds('backgroundColor: "#6366f1"', 'app/(public)/events/[slug]/opengraph-image.tsx')).toEqual([])
  })

  it('map paints may carry hex', () => {
    expect(kinds('paint: { "circle-color": "#E2912F" }', 'components/discover/discover-map.tsx')).toEqual([])
  })

  it('in-app chrome still fails a planted hex', () => {
    expect(kinds('style={{ color: "#E2912F" }}', 'components/ui/button.tsx')).toEqual(['#E2912F'])
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// THE THEME GATE (ADR-1742). Each detector gets a POSITIVE (it fires on the literal) and a MUTATION
// CONTROL (the same line, made legal, goes quiet), so a detector that matches everything and one that
// matches nothing both fail here. The last block plants literals into REAL files from the tree, so
// the gate is proven against the code it governs, not only against fixtures.
// ═════════════════════════════════════════════════════════════════════════════════════════════════

const pal = (src: string, path = 'components/x.tsx') =>
  (paletteViolations(path, src) as { kind: string; match: string }[]).map((v) => `${v.kind}:${v.match}`)
const sites = (path: string, src: string) =>
  (themeSites(path, src) as { kind: string; match: string }[]).map((s) => `${s.kind}|${s.match}`)

describe('hard: the Tailwind default palette and the monochromes, in .ts/.tsx', () => {
  it('catches every shape the owner listed', () => {
    expect(pal('<div className="bg-white text-black" />')).toEqual([
      'white-black-literals:-white',
      'white-black-literals:-black',
    ])
    expect(pal('<div className="bg-black/50" />')).toEqual(['white-black-literals:-black'])
    expect(pal('<p className="text-amber-700 hover:bg-gray-50 ring-indigo-500/30" />')).toEqual([
      'raw-palette:text-amber-700',
      'raw-palette:bg-gray-50',
      'raw-palette:ring-indigo-500',
    ])
    for (const c of ['from-rose-400', 'to-sky-900', 'via-emerald-100', 'fill-slate-950', 'stroke-zinc-300', 'border-violet-200']) {
      expect(pal(`<i className="${c}" />`), c).toHaveLength(1)
    }
  })

  it('mutation control: the semantic token in the same place is clean', () => {
    expect(pal('<div className="bg-surface text-text bg-ink/50 text-on-ink font-black" />')).toEqual([])
    expect(pal('<p className="text-primary-strong hover:bg-surface-elevated ring-primary/30" />')).toEqual([])
  })

  it('honours the written carve-outs: KEEP <utility>: <reason>, and token-ok', () => {
    const keep = '// KEEP bg-white: a QR reader needs a true-white quiet zone.\n<div className="bg-white" />'
    expect(pal(keep)).toEqual([])
    expect(pal('<div className="bg-white" /> // token-ok: printed paper')).toEqual([])
    // ...but the KEEP covers one site, not the next bare one.
    expect(pal(`${keep}\n<div className="bg-white" />`)).toEqual(['white-black-literals:-white'])
  })

  it('reads its patterns from adoption-baselines.json, so there is one definition of each class', () => {
    const config = JSON.parse(readFileSync('scripts/adoption-baselines.json', 'utf8'))
    for (const key of ['raw-palette', 'white-black-literals']) {
      const e = config.entries.find((x: { key: string }) => x.key === key)
      expect(e.baseline, `${key} must stay a 0 floor to be hard`).toBe(0)
    }
  })

  it('skips raster OG files, the same scope adoption uses', () => {
    expect(pal('<div tw="bg-white" />', 'lib/og/event-card.tsx')).toEqual([])
  })
})

describe('ratchet: inline style literals in .tsx', () => {
  const P = 'components/x.tsx'
  it('named colours in a style object or a JSX colour attribute', () => {
    expect(sites(P, '<a style={{ color: "white", boxShadow: "0 0 0 1px black" }} />')).toEqual([
      "tsx-style-colour|color: 'white'",
      "tsx-style-colour|boxShadow: 'black'",
    ])
    expect(sites(P, '<path fill="white" stroke="red" />')).toEqual(['tsx-style-colour|fill="white"', 'tsx-style-colour|stroke="red"'])
  })
  it('mutation control: tokens, currentColor, none and var() are clean', () => {
    expect(sites(P, '<a style={{ color: "var(--color-text)", boxShadow: "0 0 0 1px var(--color-border)" }} />')).toEqual([])
    expect(sites(P, '<path fill="currentColor" stroke="none" />')).toEqual([])
    expect(sites(P, '<a style={{ color: "transparent", background: "var(--color-white-ish)" }} />')).toEqual([])
  })
  it('literal font sizes and families', () => {
    expect(sites(P, '<p style={{ fontSize: 12 }} />')).toEqual(['tsx-style-font-size|fontSize: 12'])
    expect(sites(P, "<p style={{ fontSize: '0.8rem' }} />")).toEqual(["tsx-style-font-size|fontSize: '0.8rem'"])
    expect(sites(P, '<text fontSize="10" />')).toEqual(['tsx-style-font-size|fontSize="10"'])
    expect(sites(P, "<p style={{ fontFamily: 'Inter, sans-serif' }} />")).toEqual(['tsx-style-font-family|fontFamily: Inter'])
  })
  it('mutation control: a token, a variable, or a generic family is clean', () => {
    expect(sites(P, "<p style={{ fontSize: 'var(--text-meta)', fontFamily: 'var(--design-font-body)' }} />")).toEqual([])
    expect(sites(P, '<p style={{ fontSize: size, fontFamily: theme.font }} />')).toEqual([])
    expect(sites(P, "<p style={{ fontFamily: 'inherit' }} />")).toEqual([])
  })
  it('only .tsx: a .ts object `{ color: "green" }` is a variant name, not a style', () => {
    expect(tsxThemeSites('lib/x.ts', 'const v = { style: {{ color: "green" }} }')).toEqual([])
  })
  it('a comment and the token-ok escape are not sites', () => {
    expect(sites(P, '// <a style={{ color: "white" }} />')).toEqual([])
    expect(sites(P, '// token-ok: brand mark\n<a style={{ color: "white" }} />')).toEqual([])
  })
  it('colour functions the hard rgb() scan cannot see: inside an arbitrary class, and hsl/oklch/lab', () => {
    expect(sites(P, '<p className="[text-shadow:0_1px_3px_rgb(0_0_0/0.35)]" />')).toEqual(['tsx-colour-function|_rgb(0'])
    expect(sites('lib/x.ts', "const c = 'hsl(220 40% 50%)'; const d = 'oklch(0.7 0.1 200)'")).toEqual([
      'tsx-colour-function|hsl(2',
      'tsx-colour-function|oklch(0',
    ])
    // The hard check still owns the plain rgb( and still misses the underscore form: no double count, no gap.
    expect(kinds('<p className="[text-shadow:0_1px_3px_rgb(0_0_0/0.35)]" />')).toEqual([])
  })
  it('mutation control: color-mix(in oklab, …) over tokens and a var() argument are sanctioned', () => {
    expect(sites(P, '<p className="bg-[color-mix(in_oklab,var(--color-primary)_40%,transparent)]" />')).toEqual([])
    expect(sites('lib/x.ts', "const m = 'color-mix(in oklab, var(--color-ink) 30%, transparent)'")).toEqual([])
    expect(sites('lib/x.ts', "const v = 'hsl(var(--brand-hsl))'")).toEqual([])
  })
  it('the raster allowlist applies (Satori cannot read CSS variables)', () => {
    expect(sites('app/x/opengraph-image.tsx', "<div style={{ fontFamily: 'Nunito', fontSize: 40 }} />")).toEqual([])
  })
})

describe('ratchet: hand-written CSS', () => {
  it('parses declarations, not selectors or at-rule preludes', () => {
    const rules = cssDeclarations('a:hover { color: red }\n@media (max-width: 600px) { .x { margin: 0; } }')
    const decls = rules.flatMap((r) => (r?.decls ?? []).map((d: { prop: string }) => d.prop))
    expect(decls).toEqual(['color', 'margin'])
  })

  it('app/globals.css: literals outside token declarations count, token declarations do not', () => {
    const G = 'app/globals.css'
    expect(sites(G, ':root { --color-primary: #E2912F; --shadow: 0 1px 2px rgba(0,0,0,.1); }')).toEqual([])
    expect(sites(G, '.x { color: #E2912F; background: white; box-shadow: 0 0 0 1px rgba(0,0,0,.1) }')).toEqual([
      'css-colour|color: #E2912F',
      'css-colour|background: white',
      'css-colour|box-shadow: rgba(',
    ])
    expect(sites(G, ".x { font-family: 'Inter', system-ui }")).toEqual(["css-font-family|font-family: 'Inter'"])
    expect(sites(G, ':root { --design-font-body: "Nunito", sans-serif }')).toEqual([])
  })

  it('mutation control: var(), transparent, currentColor, a var named after a colour are clean', () => {
    expect(sites('app/globals.css', '.x { color: var(--color-white); background: transparent; border-color: currentColor; fill: var(--fq-linen) }')).toEqual([])
  })

  it('a mask is geometry, not a colour', () => {
    expect(sites('app/globals.css', '.x { -webkit-mask-image: linear-gradient(#000, transparent); mask: linear-gradient(black, transparent) }')).toEqual([])
  })

  it('the alias layer may carry a literal that says what it mirrors, and only then', () => {
    const A = 'app/themes/frequency.css'
    expect(sites(A, ':root { --color-on-ink: #F6F0FF; /* Stage --text-strong */ }')).toEqual([])
    expect(sites(A, ':root { --color-on-ink: #F6F0FF; }')).toEqual(['css-colour|--color-on-ink: #F6F0FF'])
    // ...and a font token there names its face, which is its job.
    expect(sites(A, ":root { --fq-font-sans: var(--font-hanken, 'Hanken Grotesk'), sans-serif; }")).toEqual([])
  })

  it('a page sheet may not mint a private colour token', () => {
    expect(sites('app/themes/frequency/members-a.css', '.x { --mine: #123456 }')).toEqual(['css-colour|--mine: #123456'])
  })

  it('an @apply of a palette class is a palette class', () => {
    expect(sites('app/themes/frequency/members-a.css', '.x { @apply bg-white text-gray-500 hover:bg-black/40; }')).toEqual([
      'css-colour|@apply bg-white',
      'css-colour|@apply text-gray-500',
      'css-colour|@apply hover:bg-black/40',
    ])
    expect(sites('app/themes/frequency/members-a.css', '.x { @apply bg-surface text-muted; }')).toEqual([])
  })

  it('the 13px floor: 11px only as an uppercase label, 12px only on a tag/chip', () => {
    const F = 'app/themes/frequency/members-ui.css'
    expect(sites(F, '.k { font-size: 10px }')).toEqual(['css-font-size-floor|font-size: 10px'])
    expect(sites(F, '.k { font: 500 11px/1 var(--fq-font-display) }')).toEqual(['css-font-size-floor|font: 11px'])
    expect(sites(F, '.k { font: 500 11px/1 var(--fq-font-display); text-transform: uppercase }')).toEqual([])
    expect(sites(F, '.meta { font-size: 12px }')).toEqual(['css-font-size-floor|font-size: 12px'])
    expect(sites(F, '.tag.mu-sm { font-size: 12px }')).toEqual([])
    expect(sites(F, '.chip { font-size: 13px } .x { font-size: var(--fq-text-label) }')).toEqual([])
    // DAWN-side sheets are not held to Frequency's floor.
    expect(sites('components/sites/editor/editor.css', '.k { font-size: 10px }')).toEqual([])
  })

  it('generated sheets are the design, not hand-written CSS', () => {
    const gen = '/* GENERATED by scripts/install-frequency-design.mjs (ADR-1740) */\n.x { color: #fff; font-size: 9px }'
    expect(isGeneratedCss(gen)).toBe(true)
    expect(cssThemeSites('app/themes/frequency/kit-site.css', gen)).toEqual([])
    // Mutation control: the same body without the header is counted.
    expect(cssThemeSites('app/themes/frequency/kit-site.css', gen.split('\n')[1])).toHaveLength(2)
    for (const f of ['core', 'kit-admin', 'kit-editor', 'kit-members', 'kit-site']) {
      expect(isGeneratedCss(readFileSync(`app/themes/frequency/${f}.css`, 'utf8')), f).toBe(true)
    }
    expect(isGeneratedCss(readFileSync('app/themes/frequency.css', 'utf8'))).toBe(false)
  })

  it('reports the line of the declaration', () => {
    const r = cssThemeSites('app/globals.css', '.a {\n  margin: 0;\n  color: red;\n}') as { line: number }[]
    expect(r.map((x) => x.line)).toEqual([3])
    expect(lineIndex('a\nb\nc')(4)).toBe(3)
  })
})

describe('the ratchet: per file, may fall, never rise', () => {
  const base = { frozen: { at: '2026-10-13', direction: 'seed', reason: 'seed' }, counts: { 'css-colour': { 'a.css': 2 } } }
  const counts = (o: Record<string, Record<string, number>>) => ({ ...Object.fromEntries(RATCHET_KINDS.map((k: string) => [k, {}])), ...o })

  it('a hold or a fall passes; a rise in a listed file fails; any site in an unlisted file fails', () => {
    expect(compareTheme(counts({ 'css-colour': { 'a.css': 2 } }), base).risen).toEqual([])
    expect(compareTheme(counts({ 'css-colour': { 'a.css': 1 } }), base).risen).toEqual([])
    expect(compareTheme(counts({ 'css-colour': { 'a.css': 3 } }), base).risen).toHaveLength(1)
    expect(compareTheme(counts({ 'css-colour': { 'a.css': 1, 'b.css': 1 } }), base).risen).toEqual([
      { kind: 'css-colour', file: 'b.css', baseline: 0, current: 1 },
    ])
  })

  it('--update writes falls, refuses a rise without --allow-raise, and records a forced one', () => {
    const fell = mergeTheme(counts({ 'css-colour': { 'a.css': 1 } }), base, { reason: 'sweep', at: '2026-10-14' })
    expect(fell.written).toBe(true)
    expect(fell.next?.frozen.direction).toBe('lowered')
    expect(mergeTheme(counts({ 'css-colour': { 'a.css': 3 } }), base, { reason: 'x' }).written).toBe(false)
    const forced = mergeTheme(counts({ 'css-colour': { 'a.css': 3 } }), base, { reason: 'moved', allowRaise: true })
    expect(forced.next?.frozen.direction).toBe('raised')
  })

  it('tally groups by class and file', () => {
    const t = tally([
      { file: 'a.css', kind: 'css-colour' },
      { file: 'a.css', kind: 'css-colour' },
      { file: 'b.tsx', kind: 'tsx-style-font-size' },
    ])
    expect(t['css-colour']).toEqual({ 'a.css': 2 })
    expect(t['tsx-style-font-size']).toEqual({ 'b.tsx': 1 })
  })
})

describe('proven against the real tree', () => {
  it('the tree holds: no hard palette site, and no file above its frozen count', () => {
    const real = scanTheme()
    expect(real.hard).toEqual([])
    expect(compareTheme(tally(real.sites), loadThemeBaseline()).risen).toEqual([])
    expect(real.cssFiles).toBeGreaterThan(10)
  }, 120_000)

  it('every scanned CSS class is reachable: a planted literal in a REAL sheet raises its count by one', () => {
    for (const [file, plant, kind] of [
      ['app/themes/frequency/members-shell.css', '.planted { color: white }', 'css-colour'],
      ['app/themes/frequency/members-shell.css', ".planted { font-family: 'Inter' }", 'css-font-family'],
      ['app/themes/frequency/members-shell.css', '.planted { font-size: 10px }', 'css-font-size-floor'],
      ['app/globals.css', '.planted { background: #123456 }', 'css-colour'],
    ] as const) {
      const src = readFileSync(file, 'utf8')
      const n = (s: string) => (themeSites(file, s) as { kind: string }[]).filter((x) => x.kind === kind).length
      expect(n(`${src}\n${plant}\n`) - n(src), `${file} ${kind}`).toBe(1)
    }
  })

  it('a planted literal in a REAL component is caught by the right class', () => {
    const file = 'components/ui/button.tsx'
    const src = readFileSync(file, 'utf8')
    expect(pal(src, file)).toEqual([])
    expect(pal(`${src}\nexport const Planted = () => <div className="bg-black/50 text-red-600" />\n`, file)).toEqual([
      'raw-palette:text-red-600',
      'white-black-literals:-black',
    ])
    const n = (s: string) => (themeSites(file, s) as unknown[]).length
    expect(n(`${src}\nexport const P = () => <p style={{ fontSize: 11, color: 'white' }} />\n`) - n(src)).toBe(2)
  })
})
