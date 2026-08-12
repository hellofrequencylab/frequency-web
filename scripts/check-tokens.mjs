#!/usr/bin/env node
// Token guard — keeps in-app UI on the DAWN token layer so the header/theme unification
// doesn't regress into hardcoded style (AGENTS.md §46,63: colors are DAWN tokens only,
// type uses the named scale).
//
// Scope: .tsx/.ts under app/, components/ AND lib/. (lib/ was ungoverned until 2026-08-04 and held
// the largest raw-hex concentration in the repo — ~185 matches across 24 files. Nearly all of them
// are legitimate: email HTML, generated raster/print assets, validated color DATA. They are
// enumerated one by one in ALLOWLIST below with the reason, rather than skipped as a directory,
// so a NEW hardcoded color in lib/ is still caught.) Flags three hardcoded-style anti-patterns:
//   (a) raw hex colors           #rgb / #rrggbb / #rrggbbaa   → use a DAWN token utility/var
//   (b) arbitrary type sizes     text-[Npx]                   → use the named scale
//                                                               (text-2xs=11px, text-3xs=10px, xs/sm/base…)
//   (c) inline rgb()/rgba()      color literals in className/style → use a token
//
// NOT here, on purpose: arbitrary px in SIZING utilities (`h-[18px]`, `min-w-[180px]`). ~140 of
// those predate the rule and no sweep owns them, so hard-failing would either block every PR or
// force a blanket exemption. They are held by the `raw-px-arbitrary` RATCHET instead
// (scripts/adoption-baselines.json) — the count can shrink, never grow, and screen passes retire
// it. Type size stays a hard failure here because `text-[Npx]` has no legitimate use: the named
// scale covers every size, and off-scale type is the thing the scale exists to prevent.
//
// These are DAWN tokens, not raw values: the token names live in app/globals.css
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

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

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
const ALLOWLIST = [
  // exact files
  (p) => p === 'app/globals.css',
  (p) => p === 'lib/spaces/accent.ts',
  (p) => p === 'lib/spaces/cover-placeholder.ts',
  (p) => p === 'components/admin/spaces/space-brand-editor.tsx',
  (p) => p === 'components/spaces/space-form.tsx',
  // server-rendered standalone HTML / transactional email: inline hex is required
  // (email clients + pre-CSS documents don't resolve CSS custom properties).
  (p) => p === 'app/api/cron/event-reminders/route.ts',
  (p) => p === 'app/u/scan/route.ts',
  // directory prefixes
  (p) => p.startsWith('lib/theme/'),
  (p) => p.startsWith('components/admin/theme-studio/'),
  (p) => p.startsWith('components/admin/email-studio/'),
  (p) => p.startsWith('components/spaces/email/'),
  // the PUBLIC MARKETING site + its UI primitives are a separate brand design system (PhotoHero,
  // brand demos), not the in-app DAWN surface the guard governs — mirrors check-headers' marketing skip.
  (p) => p.startsWith('app/(marketing)/'),
  (p) => p.startsWith('components/marketing/'),
  // third-party OAuth PROVIDER brand palettes (the Google "G" is a fixed 4-color mark, not a token).
  // Scoped to 'hex color': the reason is a brand palette, so it must not also waive the type scale.
  // It used to, and induction.tsx's `text-[10px]` rode along on an exemption granted for four hexes.
  { match: (p) => p.startsWith('app/sign-in/'), kinds: ['hex color'] },
  { match: (p) => p === 'app/onboarding/beta/induction.tsx', kinds: ['hex color'] },
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
  //     strip <style> entirely), so the medium REQUIRES literal hex in inline styles. Changing
  //     these to tokens would ship colorless mail.
  (p) => p === 'lib/email.ts',
  (p) => p === 'lib/email-studio/render.ts',
  (p) => p === 'lib/comms/email-template.ts',
  (p) => p === 'lib/comms/outbound-batch.ts',
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
  (p) => p === 'lib/entry-points/brand.ts',
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
 * that — `app/onboarding/beta/induction.tsx` was allowlisted for a 4-hex Google brand mark and the
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
  { kind: 'hex color', re: HEX, hint: 'use a DAWN token utility/var (e.g. text-text, bg-surface, var(--color-primary))' },
  { kind: 'arbitrary text size', re: TEXT_ARBITRARY, hint: 'use the named scale (text-3xs=10px, text-2xs=11px, else a type ROLE: text-meta / text-body-sm / text-body)' },
  { kind: 'inline rgb()/rgba()', re: RGB, hint: 'use a DAWN token (e.g. bg-primary, var(--color-…))' },
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
  const violations = runCheck()
  if (violations.length === 0) {
    console.log('✓ Token guard: in-app UI uses DAWN tokens + the named type scale (no raw hex, no arbitrary text size in text-[N(px|rem|em|pt|ch|ex)], no inline rgb()).')
    return
  }
  console.error(`\n✗ Token guard failed — ${violations.length} hardcoded-style violation(s). Colors are DAWN tokens only; type uses the named scale:\n`)
  for (const v of violations) {
    console.error(`  • ${v.file}:${v.line} — ${v.kind}: ${v.match}\n      → ${v.hint}`)
  }
  console.error(
    '\nReplace the literal with a DAWN token (names in app/globals.css: primary/signal/broadcast/ink/on-ink/\n' +
      'surface/border/success/warning/danger/info + -bg/-strong/-hover, plus text/muted/subtle) and text-[Npx]\n' +
      'with a TYPE ROLE (text-3xs / text-2xs / text-meta / text-body-sm / text-body / text-body-lg /\n' +
      'text-lead / text-page-title). NOT text-xs/sm/base -- those are literals check:adoption now fails\n' +
      'on, and this hint used to recommend exactly the three classes the other gate bans. If a literal is genuinely\n' +
      'required, add `// token-ok: <reason>` on the line (or the line above), or allowlist the file in\n' +
      'scripts/check-tokens.mjs. See AGENTS.md §46,63.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
