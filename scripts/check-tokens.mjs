#!/usr/bin/env node
// Token guard — keeps in-app UI on the SEMANTIC token layer so it wears whichever design is switched
// on (DAWN or Frequency, ADR-1737) instead of regressing into hardcoded style (docs/THEME-PROTOCOL.md
// §3: colours are semantic tokens only, type uses the named scale). The second half of this file, the
// THEME GATE (ADR-1742), adds the palette/monochrome classes, inline style literals and hand-written
// CSS; its header says what each class counts.
//
// Scope: .tsx/.ts under app/, components/ AND lib/. (lib/ was ungoverned until 2026-08-04 and held
// the largest raw-hex concentration in the repo — ~185 matches across 24 files. Nearly all of them
// are legitimate: email HTML, generated raster/print assets, validated color DATA. They are
// enumerated one by one in ALLOWLIST below with the reason, rather than skipped as a directory,
// so a NEW hardcoded color in lib/ is still caught.) Flags three hardcoded-style anti-patterns:
//   (a) raw hex colors           #rgb / #rrggbb / #rrggbbaa   → use a semantic token utility/var
//   (b) arbitrary type sizes     text-[Npx]                   → use the named scale
//                                                               (text-2xs, text-3xs + the roles; px per design, docs/THEME.md §0)
//   (c) inline rgb()/rgba()      color literals in className/style → use a token
//
// NOT here, on purpose: arbitrary px in SIZING utilities (`h-[18px]`, `min-w-[180px]`). ~140 of
// those predate the rule and no sweep owns them, so hard-failing would either block every PR or
// force a blanket exemption. They are held by the `raw-px-arbitrary` RATCHET instead
// (scripts/adoption-baselines.json) — the count can shrink, never grow, and screen passes retire
// it. Type size stays a hard failure here because `text-[Npx]` has no legitimate use: the named
// scale covers every size, and off-scale type is the thing the scale exists to prevent.
//
// The semantic names are DAWN's (both designs fill them; Frequency through the alias layer in
// app/themes/frequency.css), and they live in app/globals.css
// (primary/signal/broadcast/ink/on-ink/surface/border/success/warning/danger/info,
// each with -bg/-strong/-hover steps + text/muted/subtle).
//
// Allowlist: color DATA / canvas / raster / pickers are legitimately exempt (they carry
// color values, they are not UI chrome) — see ALLOWLIST below. Inline escape hatch: a line
// (or the line directly above it) carrying `// token-ok: <reason>` or `{/* token-ok */}`
// is skipped, for the rare genuinely-required literal.
//
// Usage: `node scripts/check-tokens.mjs` (or `pnpm check:tokens`). Exits 1 on violation,
// printing file:line + the match so CI fails the PR. Model: scripts/check-menu.mjs.
// Re-freeze the theme ratchet after a sweep: `pnpm check:tokens --update --reason "<which sweep>"`.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { invokedDirectly } from './lib/invoked-directly.mjs'
import { inScope, escapeChecker, stripComments as stripAdoptionComments } from './check-adoption.mjs'

const ROOTS = ['app', 'components', 'lib']
// Escape hatch: `// token-ok: <reason>` (line comment) or a `/* token-ok … */` block comment — the
// latter covers both the JSX `{/* token-ok */}` form and a bare CSS/JS block comment (so a literal
// inside a CSS-in-JS template can be annotated on its own line). Honored on the match line OR the
// line directly above it.
const ANNOTATION = /\/\/\s*token-ok:|\/\*\s*token-ok\b/

// Files/areas that legitimately carry color DATA (not UI tokens): the token source itself,
// theme/skin registries, accent + cover generators, map markers, raster OG/social images,
// the theme/email studios + email templates (author raw brand color), QR styling, the Space
// brand/color pickers, and dataviz/chart color files. Each predicate takes the POSIX relpath.
//
// HYG-099 (ADR-1429): this list IS the leftover-hex sweep. Remaining literals are craft
// (Satori OG, maps, email HTML, token DATA). Do not churn token files without a DAWN sync.
// In-app chrome still fails a planted hex (scripts/check-tokens.test.ts).
const ALLOWLIST = [
  // exact files
  (p) => p === 'app/globals.css',
  (p) => p === 'lib/spaces/accent.ts',
  (p) => p === 'lib/spaces/cover-placeholder.ts',
  (p) => p === 'components/admin/spaces/space-brand-editor.tsx',
  (p) => p === 'components/spaces/space-form.tsx',
  // server-rendered standalone HTML / transactional email: inline hex is required
  // (email clients + pre-CSS documents don't resolve CSS custom properties).
  (p) => p === 'app/u/scan/route.ts',
  // directory prefixes
  (p) => p.startsWith('lib/theme/'),
  (p) => p.startsWith('components/admin/theme-studio/'),
  (p) => p.startsWith('components/admin/email-studio/'),
  (p) => p.startsWith('components/spaces/email/'),
  // ── THE MARKETING EXEMPTION IS GONE (PROG-P9, 2026-08-25, ADR-1123) ──────────────────────
  // Two whole-file waivers used to live here — `app/(marketing)/` and `components/marketing/` —
  // on the reasoning that "the PUBLIC MARKETING site + its UI primitives are a separate brand
  // design system, not the in-app DAWN surface the guard governs".
  //
  // Re-measured before removal, which is the only reason this is a deletion and not a debate:
  // the classifier was run over both trees with the two entries lifted, and it reported
  // **0 violations across 61 files** — no raw hex, no `text-[Npx]`, no inline `rgb()`. Marketing
  // consumes the SAME `@theme inline` vocabulary the app does (a strict subset of it: 3 utility
  // names appear on marketing and nowhere in-app, and all three are app tokens). There was no
  // second brand system to protect. The waiver was protecting nothing and hiding that fact.
  //
  // What IS a separate system on the marketing surface is real and stays separate: the Anton
  // display face, the `.mk-band/.mk-beat/.mk-cont/.mk-tight` vertical rhythm, and the
  // `--color-marketing-canvas` ground. None of those is a hardcoded literal, so none of them
  // needed this exemption either. `check-headers` and `check-templates` keep their marketing
  // skips — those govern PAGE STRUCTURE, which genuinely does differ.
  // third-party OAuth PROVIDER brand palettes (the Google "G" is a fixed 4-color mark, not a token).
  // Scoped to 'hex color': the reason is a brand palette, so it must not also waive the type scale.
  // It used to, and induction.tsx's `text-[10px]` rode along on an exemption granted for four hexes.
  { match: (p) => p.startsWith('app/sign-in/'), kinds: ['hex color'] },
  { match: (p) => p === 'app/join/(induction)/induction.tsx', kinds: ['hex color'] },
  // print stylesheet: a print document renders literal CSS, not the app's CSS-var cascade.
  (p) => p.startsWith('app/print/'),
  // map markers: *-map.tsx / *map*.tsx
  (p) => /(?:^|\/)[^/]*map[^/]*\.tsx?$/.test(p),
  // raster OG / social images (canvas-drawn, need raw color)
  (p) => /(?:^|\/)opengraph-image\.tsx$/.test(p),
  (p) => /(?:^|\/)twitter-image\.tsx$/.test(p),
  // The ROOT card's generator (ADR-1002). Same raster exemption as the two above — it IS the old
  // app/opengraph-image.tsx, moved out of the metadata-image filenames so Next stops inheriting it
  // into every page in the app. Satori has no access to the CSS token cascade either way.
  (p) => p === 'app/dev/og-root-card/route.tsx',
  (p) => /^app\/.*image[^/]*\.tsx?$/.test(p),
  // QR styling
  (p) => /\/qr\/.*style[^/]*\.tsx?$/.test(p),
  // dataviz / chart color files
  (p) => /(?:^|\/)(?:charts?|dataviz)\//.test(p) || /(?:chart|dataviz)[^/]*colou?r/i.test(p),

  // ── lib/ (added to ROOTS 2026-08-04, UX-MATURITY-PLAN addendum) ──────────────────────────
  // lib/ holds no UI chrome; what it holds is (1) HTML that renders OUTSIDE the app's CSS
  // cascade, (2) generated assets, (3) color as DATA. Each file is listed with its reason so
  // the exemption is reviewable and a NEW hardcoded color elsewhere in lib/ still fails.
  //
  // (1) TRANSACTIONAL EMAIL HTML. Email clients do not resolve CSS custom properties (and many
  //     strip <style> entirely), so the medium REQUIRES literal hex in inline styles. The literal
  //     comes from lib/theme/palette.ts (`${palette.x}`), never typed by hand: lib/email.ts,
  //     lib/comms/email-template.ts, outbound-batch.ts, waitlist-notify.ts, this-week.ts and the
  //     event-reminders cron left this list under EMAIL-023 and the guard now holds them. The
  //     files still here carry a hand-typed grey ramp and leave the list as they are moved.
  (p) => p === 'lib/email-studio/render.ts',
  (p) => p === 'lib/automations.ts',
  (p) => p === 'lib/nurture/runner.ts',
  (p) => p === 'lib/studio/agent.ts',
  (p) => p === 'lib/studio/campaigns.ts',
  (p) => p === 'lib/spaces/campaigns.ts',
  (p) => p === 'lib/spaces/campaigns-send-due.ts',
  (p) => p === 'lib/spaces/drip-runner.ts',
  (p) => p.startsWith('lib/ai/vera/') && /(?:autonomous-send|execute|owner-brief)\.ts$/.test(p),
  // (2) GENERATED ASSETS rendered outside the DOM — OG/social rasters, QR codes, the print
  //     flyer, canvas/SVG exports. A canvas fillStyle cannot read a CSS variable.
  (p) => p.startsWith('lib/og/'),
  (p) => p.startsWith('lib/qr/'),
  (p) => p === 'lib/library/export-svg.ts',
  // (3) COLOR AS DATA — token sources, member-supplied color validators, and derived-contrast
  //     helpers. The hex here is the VALUE being validated/stored/computed, not applied style.
  (p) => p === 'lib/spotlight/theme.ts',
  (p) => p === 'lib/spaces/email-colors.ts',
  // (4) A third-party API payload with a literal-hex field (the Google Wallet pass background).
  (p) => p === 'lib/wallet/google.ts',
  // (5) PROSE that merely contains a #hex-SHAPED token: an AI prompt's example license number
  //     ("Lic #123456") and the member-facing hint "enter a hex like #E2912F". Neither file can
  //     carry styling — one builds a model prompt, the other validates a settings form.
  (p) => p === 'lib/ai/connections-ai.ts',
  (p) => p === 'lib/spaces/profile-settings.ts',
]

/**
 * Is this file exempt from `kind`?
 *
 * An ALLOWLIST entry is either a bare predicate (exempt from EVERY check) or
 * `{ match, kinds }` (exempt from those kinds only). The distinction exists because a whole-file
 * waiver granted for one reason silently waives every other class in the file, and nobody decides
 * that — `app/join/(induction)/induction.tsx` was allowlisted for a 4-hex Google brand mark and the
 * exemption quietly covered its arbitrary type as well. Prefer `kinds` for any entry whose reason
 * names a specific class of literal.
 */
function isAllowed(relPath, kind) {
  return ALLOWLIST.some((entry) => {
    if (typeof entry === 'function') return entry(relPath)
    if (!entry.match(relPath)) return false
    return kind === undefined ? false : entry.kinds.includes(kind)
  })
}

// (a) hex colors: #rgb / #rrggbb / #rrggbbaa (longest first so the match reads whole).
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
// (b) arbitrary type size. This used to be `/text-\[\d+px\]/` — px only — so the canon's ban on
// arbitrary content type could be sidestepped by writing the same size in another unit, and two
// live sites did exactly that (`text-[0.7rem]`, `text-[0.85em]`) while the gate read green.
// `clamp()` is deliberately NOT matched: fluid DISPLAY sizing is a different class with its own
// rules, and folding it in here would report 25 sites the canon does not ban.
const TEXT_ARBITRARY = /text-\[\d*\.?\d+(?:px|rem|em|pt|ch|ex)\]/g
// (c) inline rgb()/rgba() color literal.
const RGB = /\brgba?\(/g

const CHECKS = [
  { kind: 'hex color', re: HEX, hint: 'use a semantic token utility/var (e.g. text-text, bg-surface, var(--color-primary))' },
  { kind: 'arbitrary text size', re: TEXT_ARBITRARY, hint: 'use the named scale (text-3xs / text-2xs (label / tag, px per design: docs/THEME.md §0), else a type ROLE: text-meta / text-body-sm / text-body)' },
  { kind: 'inline rgb()/rgba()', re: RGB, hint: 'use a semantic token (e.g. bg-primary, var(--color-…))' },
]

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    // .tsx/.ts, excluding test/spec (their color fixtures are data, not shipped style — mirrors check-menu).
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/** Blank out comment characters (line + block), string-aware, keeping line count intact. A hardcoded
 *  STYLE violation lives in code/className/style — never in prose — so stripping comments removes the
 *  false positives (PR/ADR "#123" refs, example hex in doc comments, "the old inline rgb() we removed")
 *  without hiding a real style literal. String bodies are preserved (a hex inside an HTML template
 *  string is still real). */
export function stripComments(src) {
  const out = []
  let inBlock = false
  for (const raw of src.split('\n')) {
    let s = ''
    let str = '' // active string delimiter: ' " or `
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i]
      const n = raw[i + 1]
      if (inBlock) {
        if (c === '*' && n === '/') { inBlock = false; i++; s += '  ' } else s += ' '
        continue
      }
      if (str) {
        s += c
        if (c === '\\') { if (n !== undefined) { s += n; i++ } continue }
        if (c === str) str = ''
        continue
      }
      if (c === '/' && n === '/') { s += ' '.repeat(raw.length - i); break } // line comment → rest of line
      if (c === '/' && n === '*') { inBlock = true; i++; s += '  '; continue }
      if (c === "'" || c === '"' || c === '`') { str = c; s += c; continue }
      s += c
    }
    out.push(s)
  }
  return out
}

/** Pure classifier — returns {line, kind, match, hint} violations for one file's source. */
export function tokenViolations(relPath, src) {
  if (isAllowed(relPath)) return []
  const rawLines = src.split('\n')
  const codeLines = stripComments(src)
  const out = []
  for (let i = 0; i < codeLines.length; i++) {
    const code = codeLines[i]
    // Inline escape hatch: this line, or the line directly above it (checked on the RAW text so the
    // `{/* token-ok */}` / `// token-ok:` annotation itself is visible).
    if (ANNOTATION.test(rawLines[i])) continue
    if (i > 0 && ANNOTATION.test(rawLines[i - 1])) continue
    for (const c of CHECKS) {
      if (isAllowed(relPath, c.kind)) continue
      // matchAll, not match: the patterns are /g and `String.match` with a /g regex returns every
      // match but `match` WITHOUT /g returned only the first, so two literals on one line counted
      // as one. A gate that undercounts is a gate that reports progress it did not make.
      for (const m of code.matchAll(c.re)) {
        out.push({ line: i + 1, kind: c.kind, match: m[0], hint: c.hint })
      }
    }
  }
  return out
}

export function runCheck() {
  const files = ROOTS.flatMap(walk)
  const violations = []
  for (const f of files) {
    const rel = f.split('\\').join('/')
    for (const v of tokenViolations(rel, readFileSync(f, 'utf8'))) violations.push({ file: rel, ...v })
  }
  return violations
}

/** A gate that scans nothing reports a clean bill of health, and this one prints no count at all,
 *  so an under-scan is invisible. `walk()` returns [] for a missing root without complaint. The
 *  floor sits well under the live corpus (~3274 on 2026-08-10) and far above zero, so it fires on
 *  a broken read rather than on growth. Same pattern as MIN_ROWS in check-gate-parity.mjs. */
export const MIN_SCANNED_FILES = 1500


// ═════════════════════════════════════════════════════════════════════════════════════════════════
// THE THEME GATE (ADR-1742, 2026-10-13): everything else that ignores a design.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// The checks above were written when there was one design. With two (DAWN and Frequency, ADR-1737,
// switched in lib/theme/design.ts) a literal is no longer "off-brand", it is WRONG IN ONE OF THEM:
// `bg-white` is DAWN's paper and a hole in Frequency's night. The hex/rgb/text-[Npx] scan above could
// not see five more ways to write a literal, so this section adds them, in two tiers:
//
//   HARD (zero today, so zero forever). The Tailwind DEFAULT PALETTE (`text-amber-700`) and the
//   monochromes (`bg-white`, `text-black`, `bg-black/50`) in .ts/.tsx. Both already had a count in
//   scripts/adoption-baselines.json (`raw-palette`, `white-black-literals`), both floors are 0, but
//   check:adoption is ADVISORY in CI (OWN-004), so the next `bg-white` would have merged with a
//   warning. They are promoted here, reading the SAME entry (patterns, scope, the `KEEP <utility>:`
//   escape) so there is one definition of each class, not two drifting copies. app/globals.css
//   remaps none of these names to a token (checked 2026-10-13), so every hit is a real literal.
//
//   RATCHET (debt today, may only shrink). Each class below is counted PER FILE against
//   scripts/token-baselines.json. A file may hold or lower its count; a rise, or any site in a file
//   the baseline does not list, fails. Per-file rather than one total on purpose: ci.yml keeps
//   blocking ratchets SET-SHAPED, so a failure names the one file a PR touched and the fix is one
//   line, never "someone somewhere added one". Re-freeze after a sweep with
//     node scripts/check-tokens.mjs --update --reason "<which sweep retired them>"
//   which only writes falls; a rise needs --allow-raise and is recorded as such.
//
// The classes:
//   tsx-style-colour       a named CSS colour ('white', 'black', 'red' …) as a style-object colour
//                          value or a JSX colour attribute (fill="white").  Hex/rgb are already hard.
//   tsx-style-font-size    a literal font size in a style object or SVG attr (fontSize: 12, '0.8rem').
//   tsx-style-font-family  a literal font name in a style object or attr (fontFamily: 'Inter').
//   tsx-colour-function    a literal colour FUNCTION the hard rgb() scan cannot see, in .ts/.tsx:
//                          one inside a Tailwind arbitrary class, where the underscore hides it from
//                          \brgba?\( (`[text-shadow:0_1px_3px_rgb(0_0_0/0.35)]`), and hsl()/hsla()/
//                          hwb()/lab()/lch()/oklab()/oklch() anywhere. Numeric arguments only, so
//                          `color-mix(in oklab, var(--token) 40%, …)`, the sanctioned mix, is not a site.
//   css-colour             a hex / rgb() / hsl() / named colour, or an @apply of a palette class, in
//                          hand-written CSS. app/globals.css: outside token (`--*`) declarations only.
//                          app/themes/frequency.css (the alias layer): a literal whose line carries a
//                          comment naming the export value it mirrors is allowed.
//   css-font-family        a literal family name in font-family / font, same scoping as css-colour
//                          (a font TOKEN's own declaration names a face, which is its job).
//   css-font-size-floor    Frequency hand-written sheets: a px font size under the design's 13px floor
//                          (docs/THEME.md §0). 11px inside an uppercase rule (the label) and 12px on a
//                          tag/chip/badge/pill selector (the tag) are the design's own steps, not debt.
//
// Generated sheets are skipped: app/themes/frequency/core.css and kit-*.css carry the installer's
// `/* GENERATED by scripts/install-frequency-design.mjs` header and ARE the design. Editing them is
// already forbidden; scanning them would only count the export.

const ADOPTION_BASELINES = join('scripts', 'adoption-baselines.json')
export const TOKEN_BASELINES = join('scripts', 'token-baselines.json')

/** Adoption classes whose floor is 0 and which are theme bugs, promoted to hard failures. */
export const HARD_ADOPTION_CLASSES = ['raw-palette', 'white-black-literals']

export const RATCHET_KINDS = [
  'tsx-style-colour',
  'tsx-style-font-size',
  'tsx-style-font-family',
  'tsx-colour-function',
  'css-colour',
  'css-font-family',
  'css-font-size-floor',
]

/** The installer's header. A sheet that starts with it is the design itself, not hand-written CSS. */
export const GENERATED_HEADER = '/* GENERATED by scripts/install-frequency-design.mjs'
export const isGeneratedCss = (src) => src.trimStart().startsWith(GENERATED_HEADER)

// CSS Color 4 named colours, minus the two that are not a colour (transparent, currentcolor).
const NAMED_COLOURS = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
  'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
  'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
  'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
  'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
  'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
  'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
  'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
  'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
  'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen ' +
  'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace ' +
  'olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred ' +
  'papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue ' +
  'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey ' +
  'snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow ' +
  'yellowgreen'
).split(' ')
// A named colour as a whole CSS word: not part of `--fq-linen`, `var(--color-white)`, `whitesmoke`.
const NAMED_COLOUR = new RegExp(`(?<![-\\w])(?:${NAMED_COLOURS.join('|')})(?![-\\w])`, 'gi')
const CSS_COLOUR_FN = /(?<![-\w])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi
const CSS_GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert',
  'revert-layer',
])
// The palette + monochrome utilities, for `@apply` lines in CSS (the TSX side reads adoption's entries).
const APPLY_PALETTE =
  /(?<![-\w])(?:[a-z]+:)*(?:text|bg|border|ring|shadow|from|via|to|fill|stroke|divide|outline|decoration|accent|caret|placeholder)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)|white|black)(?:\/\d+)?(?![-\w])/g

/** offset → 1-based line, by binary search over a newline index (a slice per match is quadratic). */
export function lineIndex(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return (offset) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

/** Remove `var(...)` / `url(...)` calls (balanced) and quoted strings, keeping what is left. */
function stripCalls(value, names = ['var', 'url']) {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const rest = value.slice(i)
    const call = names.find((n) => rest.toLowerCase().startsWith(`${n}(`) && !/[-\w]/.test(value[i - 1] ?? ''))
    if (call) {
      let depth = 0
      let j = i + call.length
      for (; j < value.length; j++) {
        if (value[j] === '(') depth++
        else if (value[j] === ')' && --depth === 0) break
      }
      out += ' '
      i = j
      continue
    }
    out += value[i]
  }
  return out
}
const stripStrings = (v) => v.replace(/'[^']*'|"[^"]*"/g, '""')

/** Colour literals in one CSS value: hex, colour functions, named colours (strings and url() aside). */
export function cssColourLiterals(value) {
  const hits = [...value.matchAll(HEX)].map((m) => m[0])
  const bare = stripStrings(stripCalls(value, ['url']))
  hits.push(...[...bare.matchAll(CSS_COLOUR_FN)].map((m) => m[0]))
  hits.push(...[...stripCalls(bare, ['var']).matchAll(NAMED_COLOUR)].map((m) => m[0]))
  return hits
}

/** Literal family names in a font-family value (or the family list at the end of a `font` shorthand). */
export function fontFamilyLiterals(value, { shorthand = false } = {}) {
  const v = stripCalls(value, ['var']).trim()
  if (!v) return []
  if (shorthand) return [...v.matchAll(/'[^']+'|"[^"]+"/g)].map((m) => m[0])
  return v
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f && !CSS_GENERIC_FAMILIES.has(f.toLowerCase()) && !/^!important$/i.test(f))
}

/** Blank CSS comments (length-preserving; string-aware so `content: "/*"` survives). */
export function stripCssComments(src) {
  const out = src.split('')
  let str = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (str) {
      if (c === '\\') { i++; continue }
      if (c === str || c === '\n') str = ''
      continue
    }
    if (c === '"' || c === "'") { str = c; continue }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      for (let k = i; k < stop; k++) if (out[k] !== '\n') out[k] = ' '
      i = stop - 1
    }
  }
  return out.join('')
}

/**
 * Parse CSS into declarations with their enclosing rule. Not a full parser: enough to tell a
 * declaration (`prop: value` ended by `;` or `}`) from a selector or an at-rule prelude (ended by `{`),
 * which is the one distinction a regex over lines cannot make (`a:hover {` has a colon too).
 */
export function cssDeclarations(src) {
  const code = stripCssComments(src)
  const rules = [] // { selector, decls: [{ prop, value, line, offset }] }
  const stack = [{ selector: '', decls: [] }]
  let start = 0
  let str = ''
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (str) { if (c === '\\') i++; else if (c === str || c === '\n') str = ''; continue }
    if (c === '"' || c === "'") { str = c; continue }
    if (c !== '{' && c !== '}' && c !== ';') continue
    const raw = code.slice(start, i)
    const lead = raw.length - raw.trimStart().length
    const text = raw.trim()
    if (c === '{') {
      stack.push({ selector: text, decls: [] })
    } else if (text) {
      const colon = text.indexOf(':')
      if (text.startsWith('@apply')) {
        stack[stack.length - 1].decls.push({ prop: '@apply', value: text.slice(6), offset: start + lead })
      } else if (colon > 0 && !text.startsWith('@')) {
        stack[stack.length - 1].decls.push({
          prop: text.slice(0, colon).trim().toLowerCase(),
          value: text.slice(colon + 1).trim(),
          offset: start + lead + colon + 1,
        })
      }
    }
    if (c === '}' && stack.length > 1) rules.push(stack.pop())
    start = i + 1
  }
  while (stack.length) rules.push(stack.pop())
  const lineAt = lineIndex(src)
  for (const r of rules) for (const d of r.decls) d.line = lineAt(d.offset)
  return rules
}

/** How a CSS file is governed: `null` = not scanned. */
export function cssMode(relPath, src) {
  if (!relPath.endsWith('.css')) return null
  if (isGeneratedCss(src)) return null
  if (relPath === 'app/globals.css') return 'globals'
  if (relPath === 'app/themes/frequency.css') return 'alias'
  return 'sheet'
}
const isFrequencySheet = (p) => p === 'app/themes/frequency.css' || p.startsWith('app/themes/frequency/')

/** Type steps under the 13px floor that Frequency's own scale defines (docs/THEME.md §0). */
const FLOOR_PX = 13
const pxSize = (v) => {
  const m = /(?<![-\w.])(\d*\.?\d+)px\b/.exec(stripCalls(v, ['var', 'calc', 'clamp', 'min', 'max']))
  return m ? Number(m[1]) : null
}

/** Ratchet sites in one hand-written CSS file. */
export function cssThemeSites(relPath, src) {
  const mode = cssMode(relPath, src)
  if (!mode) return []
  const lines = src.split('\n')
  const annotated = (line) => ANNOTATION.test(lines[line - 1] ?? '') || ANNOTATION.test(lines[line - 2] ?? '')
  const commented = (line) => /\/\*/.test(lines[line - 1] ?? '')
  const out = []
  for (const rule of cssDeclarations(src)) {
    const upper = rule.decls.some((d) => d.prop === 'text-transform' && /uppercase/i.test(d.value))
    const tagLike = /(?:^|[^a-z])(?:tag|chip|badge|pill)s?(?![a-z])/i.test(rule.selector)
    for (const d of rule.decls) {
      if (annotated(d.line)) continue
      const token = d.prop.startsWith('--')
      if (token && mode === 'globals') continue
      if (d.prop === '@apply') {
        for (const m of d.value.matchAll(APPLY_PALETTE)) out.push({ line: d.line, kind: 'css-colour', match: `@apply ${m[0]}` })
        continue
      }
      // A mask reads alpha only (`mask: linear-gradient(black, transparent)` paints nothing), so its
      // black is geometry, not a colour either design could own.
      const mask = /^(?:-webkit-)?mask(?:-image)?$/.test(d.prop)
      if (!mask && !(mode === 'alias' && commented(d.line))) {
        for (const m of cssColourLiterals(d.value)) out.push({ line: d.line, kind: 'css-colour', match: `${d.prop}: ${m}` })
      }
      // A font TOKEN names its face: that is the declaration's job, in any token file.
      if (!(token && mode !== 'sheet')) {
        const fams =
          d.prop === 'font-family' || (token && /font/.test(d.prop))
            ? fontFamilyLiterals(d.value)
            : d.prop === 'font'
              ? fontFamilyLiterals(d.value, { shorthand: true })
              : []
        for (const f of fams) out.push({ line: d.line, kind: 'css-font-family', match: `${d.prop}: ${f}` })
      }
      if (isFrequencySheet(relPath) && (d.prop === 'font-size' || d.prop === 'font')) {
        const px = pxSize(d.value)
        if (px !== null && px < FLOOR_PX) {
          const designStep = (px === 11 && upper) || (px === 12 && tagLike)
          if (!designStep) out.push({ line: d.line, kind: 'css-font-size-floor', match: `${d.prop}: ${px}px` })
        }
      }
    }
  }
  return out.sort((a, b) => a.line - b.line)
}

// ── TSX: style objects and JSX colour/font attributes ────────────────────────────────────────────

/** [start, end) spans of `style={{ … }}` and `CSSProperties = { … }` object literals in comment-blanked code. */
export function styleSpans(code) {
  const spans = []
  const opener = /style=\{\{|CSSProperties\s*=\s*\{|satisfies\s+(?:React\.)?CSSProperties/g
  for (const m of code.matchAll(opener)) {
    let i = m[0].startsWith('satisfies') ? code.lastIndexOf('{', m.index) : m.index + m[0].length - 1
    if (i < 0) continue
    let depth = 0
    let j = i
    for (; j < code.length; j++) {
      if (code[j] === '{') depth++
      else if (code[j] === '}' && --depth === 0) break
    }
    spans.push([i, j + 1])
  }
  return spans
}

const STYLE_COLOUR_PROPS =
  'color|background|backgroundColor|backgroundImage|borderColor|border|borderTop|borderRight|borderBottom|borderLeft|borderTopColor|borderRightColor|borderBottomColor|borderLeftColor|outline|outlineColor|fill|stroke|boxShadow|textShadow|caretColor|accentColor|textDecorationColor|columnRuleColor|stopColor|floodColor|lightingColor|WebkitTextStroke|WebkitTextFillColor'
const STYLE_COLOUR = new RegExp(`(?<![\\w-])['"]?(?:${STYLE_COLOUR_PROPS})['"]?\\s*:\\s*(['"\`])([^'"\`]*)\\1`, 'g')
const STYLE_FONT_SIZE = /(?<![\w-])['"]?fontSize['"]?\s*:\s*(\d*\.?\d+\b|(['"`])\s*\d*\.?\d+(?:px|rem|em|pt)?\s*\2)/g
const STYLE_FONT_FAMILY = /(?<![\w-])['"]?fontFamily['"]?\s*:\s*(['"`])([^'"`]*)\1/g
const ATTR_COLOUR = /(?<![\w-])(?:fill|stroke|color|stopColor|floodColor|lightingColor)=(?:"([^"]*)"|\{\s*(['"`])([^'"`]*)\2\s*\})/g
const ATTR_FONT_SIZE = /(?<![\w-])fontSize=(?:"\s*\d*\.?\d+(?:px)?\s*"|\{\s*\d*\.?\d+\s*\})/g
const ATTR_FONT_FAMILY = /(?<![\w-])fontFamily=(?:"([^"]*)"|\{\s*(['"`])([^'"`]*)\2\s*\})/g

const namedColoursIn = (v) => [...stripCalls(v, ['var', 'url']).matchAll(NAMED_COLOUR)].map((m) => m[0])

/** Ratchet sites in one .tsx file (only .tsx: a .ts object `{ color: 'green' }` is usually a variant name). */
export function tsxThemeSites(relPath, src) {
  if (!relPath.endsWith('.tsx') || /\.(test|spec)\.tsx$/.test(relPath)) return []
  if (!/style=\{\{|CSSProperties|(?:fill|stroke|color|stopColor|floodColor|lightingColor|fontSize|fontFamily)=/.test(src)) return []
  const code = stripComments(src).join('\n')
  const rawLines = src.split('\n')
  const lineAt = lineIndex(code)
  const annotated = (line) => ANNOTATION.test(rawLines[line - 1] ?? '') || ANNOTATION.test(rawLines[line - 2] ?? '')
  const out = []
  const push = (offset, kind, match) => {
    const line = lineAt(offset)
    if (!annotated(line)) out.push({ line, kind, match })
  }
  for (const [a, b] of styleSpans(code)) {
    const span = code.slice(a, b)
    for (const m of span.matchAll(STYLE_COLOUR)) for (const n of namedColoursIn(m[2])) push(a + m.index, 'tsx-style-colour', `${m[0].split(':')[0].replace(/['"]/g, '').trim()}: '${n}'`)
    for (const m of span.matchAll(STYLE_FONT_SIZE)) push(a + m.index, 'tsx-style-font-size', m[0].replace(/\s+/g, ' '))
    for (const m of span.matchAll(STYLE_FONT_FAMILY)) for (const f of fontFamilyLiterals(m[2])) push(a + m.index, 'tsx-style-font-family', `fontFamily: ${f}`)
  }
  for (const m of code.matchAll(ATTR_COLOUR)) for (const n of namedColoursIn(m[1] ?? m[3] ?? '')) push(m.index, 'tsx-style-colour', `${m[0].split('=')[0]}="${n}"`)
  for (const m of code.matchAll(ATTR_FONT_SIZE)) push(m.index, 'tsx-style-font-size', m[0])
  for (const m of code.matchAll(ATTR_FONT_FAMILY)) for (const f of fontFamilyLiterals(m[1] ?? m[3] ?? '')) push(m.index, 'tsx-style-font-family', `fontFamily="${f}"`)
  return out.sort((x, y) => x.line - y.line)
}

/** Every ratchet site in one file, honouring the ALLOWLIST (raster/email/data files are exempt here too). */
// `_rgb(` inside an arbitrary class (the plain `rgb(` is the hard check's), or a non-rgb colour function,
// whose first argument is a number: a literal colour, not a mix of tokens.
const COLOUR_FN_LITERAL =
  /(?:(?<=_)(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)|(?<![\w-])(?:hsla?|hwb|oklch|oklab|lab|lch))\(\s*[-+]?\.?\d/g

/** Literal colour functions in one .ts/.tsx file that the hard rgb() check cannot see. */
export function colourFunctionSites(relPath, src) {
  if (!/\.tsx?$/.test(relPath) || /\.(test|spec)\.tsx?$/.test(relPath)) return []
  if (!/(?:_rgba?|hsla?|hwb|lab|lch)\(/.test(src)) return []
  const code = stripComments(src).join('\n')
  const rawLines = src.split('\n')
  const lineAt = lineIndex(code)
  const out = []
  for (const m of code.matchAll(COLOUR_FN_LITERAL)) {
    const line = lineAt(m.index)
    if (ANNOTATION.test(rawLines[line - 1] ?? '') || ANNOTATION.test(rawLines[line - 2] ?? '')) continue
    out.push({ line, kind: 'tsx-colour-function', match: code.slice(m.index - (code[m.index - 1] === '_' ? 1 : 0), m.index + m[0].length) })
  }
  return out
}

export function themeSites(relPath, src) {
  // CSS is governed by its MODE (globals / alias / sheet / generated), not by the ALLOWLIST: the list
  // waives app/globals.css whole for the hex scan, which is right there (it IS the token source) and
  // would blind this scan to every non-token rule in the biggest stylesheet in the app.
  if (relPath.endsWith('.css')) return cssThemeSites(relPath, src)
  if (isAllowed(relPath)) return []
  return [...tsxThemeSites(relPath, src), ...colourFunctionSites(relPath, src)].sort((a, b) => a.line - b.line)
}

// ── HARD: the zero-floor adoption classes ────────────────────────────────────────────────────────

let adoptionEntries = null
function hardEntries() {
  if (!adoptionEntries) {
    const config = JSON.parse(readFileSync(ADOPTION_BASELINES, 'utf8'))
    adoptionEntries = HARD_ADOPTION_CLASSES.map((key) => {
      const e = config.entries.find((x) => x.key === key)
      if (!e) throw new Error(`check:tokens: adoption class "${key}" is gone from ${ADOPTION_BASELINES}; the hard theme check reads it.`)
      if (e.baseline !== 0) throw new Error(`check:tokens: "${key}" has baseline ${e.baseline}, not 0. A hard check cannot stand on a non-zero floor; move it back to the ratchet.`)
      return e
    })
  }
  return adoptionEntries
}

/** Palette + monochrome sites in one .ts/.tsx file, by the adoption entries' own patterns, scope and escape. */
export function paletteViolations(relPath, src, entries = hardEntries()) {
  // Blanking comments can only REMOVE matches, so a file whose raw text has none has none: skip the
  // (allocation-heavy) blanker for the ~95% of files that never mention a palette class.
  if (!entries.some((e) => e.patterns.some((p) => new RegExp(p).test(src)))) return []
  const text = stripAdoptionComments(src)
  const rawLines = src.split('\n')
  const lineAt = lineIndex(text)
  const out = []
  for (const entry of entries) {
    if (!inScope(relPath, entry)) continue
    const escaped = escapeChecker(entry)
    for (const p of entry.patterns) {
      for (const m of text.matchAll(new RegExp(p, 'g'))) {
        const line = lineAt(m.index)
        if (escaped && escaped(src, text, m.index)) continue
        if (ANNOTATION.test(rawLines[line - 1] ?? '') || ANNOTATION.test(rawLines[line - 2] ?? '')) continue
        out.push({ line, kind: entry.key, match: m[0], hint: 'use a semantic token (bg-surface, text-text, bg-ink/50 …) or, for a true requirement, `KEEP <utility>: <reason>`' })
      }
    }
  }
  return out
}

// ── The corpus and the ratchet ───────────────────────────────────────────────────────────────────

function walkExt(dir, re, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walkExt(p, re, out)
    else if (re.test(e.name)) out.push(p.split('\\').join('/'))
  }
  return out
}

/** CSS under the same roots. Fewer than this means a root moved (core.css alone is one of them). */
export const MIN_CSS_FILES = 5

export function scanTheme() {
  const code = ROOTS.flatMap((r) => walkExt(r, /\.tsx?$/)).filter((p) => !/\.(test|spec)\.tsx?$/.test(p))
  const css = ROOTS.flatMap((r) => walkExt(r, /\.css$/))
  const hard = []
  const sites = []
  for (const f of code) {
    const src = readFileSync(f, 'utf8')
    for (const v of paletteViolations(f, src)) hard.push({ file: f, ...v })
    for (const s of themeSites(f, src)) sites.push({ file: f, ...s })
  }
  for (const f of css) for (const s of themeSites(f, readFileSync(f, 'utf8'))) sites.push({ file: f, ...s })
  return { hard, sites, cssFiles: css.length }
}

/** { kind: { file: count } } from a site list. */
export function tally(sites) {
  const out = Object.fromEntries(RATCHET_KINDS.map((k) => [k, {}]))
  for (const s of sites) out[s.kind][s.file] = (out[s.kind][s.file] ?? 0) + 1
  for (const k of RATCHET_KINDS) out[k] = Object.fromEntries(Object.entries(out[k]).sort(([a], [b]) => a.localeCompare(b)))
  return out
}

const sum = (o) => Object.values(o ?? {}).reduce((a, n) => a + n, 0)

/**
 * Compare today's per-file counts with the frozen ones. A file rises when its count exceeds its
 * baseline; a file the baseline does not list has a baseline of 0, so a NEW file with a literal fails.
 */
export function compareTheme(current, baseline) {
  const rows = []
  const risen = []
  for (const kind of RATCHET_KINDS) {
    const now = current[kind] ?? {}
    const was = baseline.counts?.[kind] ?? {}
    for (const [file, n] of Object.entries(now)) {
      const b = was[file] ?? 0
      if (n > b) risen.push({ kind, file, baseline: b, current: n })
    }
    rows.push({ kind, baseline: sum(was), current: sum(now), files: Object.keys(now).length })
  }
  return { rows, risen }
}

/** Re-freeze: falls are written; a rise is refused unless allowRaise. Returns the new baseline file. */
export function mergeTheme(current, baseline, { allowRaise = false, reason, at = new Date().toISOString().slice(0, 10) }) {
  // No frozen record yet = the first freeze. It writes today's tree as the floor, with direction
  // `seed`, so a seed is never mistaken for a sweep and never needs --allow-raise.
  const seed = !baseline.frozen
  const { risen, rows } = compareTheme(current, baseline)
  // Nothing moved: write nothing, so the history is a list of sweeps rather than a list of runs.
  if (!seed && JSON.stringify(current) === JSON.stringify(baseline.counts)) return { written: false, risen: [], unchanged: true }
  if (!seed && risen.length && !allowRaise) return { written: false, risen }
  const direction = seed ? 'seed' : risen.length ? 'raised' : 'lowered'
  const totals = Object.fromEntries(rows.map((r) => [r.kind, r.current]))
  const history = [...(baseline.history ?? []), { at, direction, reason, totals }]
  return {
    written: true,
    risen,
    next: { _readme: baseline._readme ?? THEME_README, frozen: { at, direction, reason }, counts: current, history },
  }
}

const THEME_README = [
  'Per-file baselines for the theme ratchet in scripts/check-tokens.mjs (ADR-1742).',
  'counts[class][file] is the number of literals that file may hold; a file not listed may hold 0.',
  'A count may hold or fall; a rise fails check:tokens. Re-freeze after a sweep, never by hand:',
  '  node scripts/check-tokens.mjs --update --reason "<which sweep retired them>"',
  'A rise is refused unless --allow-raise is passed, and is then recorded as direction raised.',
  'The class definitions and what each one exempts are in the header of the THEME GATE section of check-tokens.mjs.',
]

export function loadThemeBaseline(file = TOKEN_BASELINES) {
  if (!existsSync(file)) return { counts: {} }
  return JSON.parse(readFileSync(file, 'utf8'))
}

function printScoreboard(rows, log) {
  log('  class                   baseline  current  files')
  log('  ----------------------  --------  -------  -----')
  for (const r of rows) {
    const tag = r.current < r.baseline ? `  ↓ ${r.baseline - r.current}` : r.current > r.baseline ? '  ↑ ROSE' : ''
    log(`  ${r.kind.padEnd(22)}  ${String(r.baseline).padStart(8)}  ${String(r.current).padStart(7)}  ${String(r.files).padStart(5)}${tag}`)
  }
}

const flagValue = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null)

/** The theme half of main(). Returns false when it failed (the caller exits 1). */
function themeMain() {
  const { hard, sites, cssFiles } = scanTheme()
  if (cssFiles < MIN_CSS_FILES) {
    console.error(`✗ check:tokens found only ${cssFiles} CSS file(s), expected at least ${MIN_CSS_FILES}. A root moved; a CSS scan that reads nothing must not report a clean tree.`)
    return false
  }
  const current = tally(sites)
  const baseline = loadThemeBaseline()

  if (process.argv.includes('--update')) {
    const reason = flagValue('--reason')
    if (!reason || reason.trim().length < 12) {
      console.error('✗ --update needs --reason "<which sweep retired them>": the sentence is written into scripts/token-baselines.json.')
      return false
    }
    const res = mergeTheme(current, baseline, { allowRaise: process.argv.includes('--allow-raise'), reason })
    if (res.unchanged) {
      console.log('✓ theme ratchet: nothing moved since the last freeze, so nothing was written.')
      return true
    }
    if (!res.written) {
      console.error(`✗ ${res.risen.length} file(s) would be RAISED. Nothing written. Retire the literal, or pass --allow-raise with a reason that says why the rise is correct:`)
      for (const r of res.risen.slice(0, 20)) console.error(`    ${r.kind}  ${r.file}: ${r.baseline} → ${r.current}`)
      return false
    }
    writeFileSync(TOKEN_BASELINES, `${JSON.stringify(res.next, null, 2)}\n`)
    console.log('✓ theme ratchet re-frozen (scripts/token-baselines.json):')
    printScoreboard(compareTheme(current, res.next).rows, console.log)
    return true
  }

  let ok = true
  if (hard.length) {
    ok = false
    console.error(`\n✗ Theme gate: ${hard.length} Tailwind default-palette / monochrome class(es). They ignore BOTH designs (DAWN and Frequency):\n`)
    for (const v of hard) console.error(`  • ${v.file}:${v.line} — ${v.kind}: ${v.match}\n      → ${v.hint}`)
  } else console.log(`✓ Theme gate: no Tailwind default-palette or monochrome class (${HARD_ADOPTION_CLASSES.join(', ')} are hard at 0 here).`)
  const { rows, risen } = compareTheme(current, baseline)
  if (risen.length) {
    ok = false
    console.error(`\n✗ Theme ratchet: ${risen.length} file(s) gained a literal that ignores the design. Counts may fall, never rise:\n`)
    for (const r of risen) {
      console.error(`  • ${r.file} — ${r.kind}: ${r.baseline} → ${r.current}`)
      for (const s of sites.filter((x) => x.file === r.file && x.kind === r.kind).slice(0, 6)) console.error(`      line ${s.line}: ${s.match}`)
    }
    console.error(
      '\n  Use a semantic token (var(--color-*), a type role, var(--design-font-*)); docs/THEME.md §0 has the\n' +
        '  rules both designs share. A genuinely required literal takes `token-ok: <reason>` on its line or the\n' +
        '  line above. Banking a rise is a decision, not a fix:\n' +
        '    node scripts/check-tokens.mjs --update --allow-raise --reason "<why the rise is correct>"\n',
    )
  }
  const log = ok ? console.log : console.error
  log(`${ok ? '✓' : '·'} Theme ratchet (per file, scripts/token-baselines.json):`)
  printScoreboard(rows, log)
  if (ok && rows.some((r) => r.current < r.baseline)) {
    log('\n  A sweep landed. Re-freeze so the new floor holds:\n    node scripts/check-tokens.mjs --update --reason "<which sweep retired them>"')
  }
  return ok
}
function main() {
  const scanned = ROOTS.flatMap(walk).length
  if (scanned < MIN_SCANNED_FILES) {
    console.error(
      `✗ check:tokens scanned only ${scanned} file(s), expected at least ${MIN_SCANNED_FILES}. ` +
        'A root moved or the walk is broken; a run that reads almost nothing must fail ' +
        'rather than report a clean contract.',
    )
    process.exit(1)
  }
  // `--update` re-freezes the theme ratchet only; the hard checks have no baseline to write.
  if (process.argv.includes('--update')) process.exit(themeMain() ? 0 : 1)

  const violations = runCheck()
  if (violations.length === 0) {
    console.log('✓ Token guard: in-app UI uses semantic tokens + the named type scale (no raw hex, no arbitrary text size in text-[N(px|rem|em|pt|ch|ex)], no inline rgb()).')
  } else {
    console.error(`\n✗ Token guard failed — ${violations.length} hardcoded-style violation(s). Colors are semantic tokens only; type uses the named scale:\n`)
    for (const v of violations) {
      console.error(`  • ${v.file}:${v.line} — ${v.kind}: ${v.match}\n      → ${v.hint}`)
    }
    console.error(
      '\nReplace the literal with a semantic token (the DAWN names in app/globals.css, which both designs fill:\n' +
        'primary/signal/broadcast/ink/on-ink/surface/border/success/warning/danger/info + -bg/-strong/-hover,\n' +
        'plus text/muted/subtle) and text-[Npx] with a TYPE ROLE (text-3xs / text-2xs / text-meta /\n' +
        'text-body-sm / text-body / text-body-lg / text-lead / text-page-title). NOT text-xs/sm/base -- those\n' +
        'are literals check:adoption fails on. If a literal is genuinely required, add `// token-ok: <reason>`\n' +
        'on the line (or the line above), or allowlist the file in scripts/check-tokens.mjs.\n' +
        'See docs/THEME-PROTOCOL.md §3.\n',
    )
  }
  const themeOk = themeMain()
  if (violations.length || !themeOk) process.exit(1)
}

if (invokedDirectly(import.meta.url)) main()
