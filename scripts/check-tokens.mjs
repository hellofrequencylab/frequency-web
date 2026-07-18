#!/usr/bin/env node
// Token guard — keeps in-app UI on the DAWN token layer so the header/theme unification
// doesn't regress into hardcoded style (AGENTS.md §46,63: colors are DAWN tokens only,
// type uses the named scale).
//
// Scope: .tsx/.ts under app/ and components/. Flags three hardcoded-style anti-patterns:
//   (a) raw hex colors           #rgb / #rrggbb / #rrggbbaa   → use a DAWN token utility/var
//   (b) arbitrary type sizes     text-[Npx]                   → use the named scale
//                                                               (text-2xs=11px, text-3xs=10px, xs/sm/base…)
//   (c) inline rgb()/rgba()      color literals in className/style → use a token
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

const ROOTS = ['app', 'components']
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
  (p) => p.startsWith('app/sign-in/'),
  (p) => p === 'app/onboarding/beta/induction.tsx',
  // print stylesheet: a print document renders literal CSS, not the app's CSS-var cascade.
  (p) => p.startsWith('app/print/'),
  // map markers: *-map.tsx / *map*.tsx
  (p) => /(?:^|\/)[^/]*map[^/]*\.tsx?$/.test(p),
  // raster OG / social images (canvas-drawn, need raw color)
  (p) => /(?:^|\/)opengraph-image\.tsx$/.test(p),
  (p) => /(?:^|\/)twitter-image\.tsx$/.test(p),
  (p) => /^app\/.*image[^/]*\.tsx?$/.test(p),
  // QR styling
  (p) => /\/qr\/.*style[^/]*\.tsx?$/.test(p),
  // dataviz / chart color files
  (p) => /(?:^|\/)(?:charts?|dataviz)\//.test(p) || /(?:chart|dataviz)[^/]*colou?r/i.test(p),
]

function isAllowed(relPath) {
  return ALLOWLIST.some((f) => f(relPath))
}

// (a) hex colors: #rgb / #rrggbb / #rrggbbaa (longest first so the match reads whole).
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/
// (b) arbitrary type size: text-[12px]
const TEXT_PX = /text-\[\d+px\]/
// (c) inline rgb()/rgba() color literal.
const RGB = /\brgba?\(/

const CHECKS = [
  { kind: 'hex color', re: HEX, hint: 'use a DAWN token utility/var (e.g. text-text, bg-surface, var(--color-primary))' },
  { kind: 'arbitrary text-[Npx]', re: TEXT_PX, hint: 'use the named scale (text-3xs=10px, text-2xs=11px, else text-xs/sm/base)' },
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
      const m = code.match(c.re)
      if (m) out.push({ line: i + 1, kind: c.kind, match: m[0], hint: c.hint })
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

function main() {
  const violations = runCheck()
  if (violations.length === 0) {
    console.log('✓ Token guard: in-app UI uses DAWN tokens + the named type scale (no raw hex, no text-[Npx], no inline rgb()).')
    return
  }
  console.error(`\n✗ Token guard failed — ${violations.length} hardcoded-style violation(s). Colors are DAWN tokens only; type uses the named scale:\n`)
  for (const v of violations) {
    console.error(`  • ${v.file}:${v.line} — ${v.kind}: ${v.match}\n      → ${v.hint}`)
  }
  console.error(
    '\nReplace the literal with a DAWN token (names in app/globals.css: primary/signal/broadcast/ink/on-ink/\n' +
      'surface/border/success/warning/danger/info + -bg/-strong/-hover, plus text/muted/subtle) and text-[Npx]\n' +
      'with the named scale (text-3xs / text-2xs / text-xs / text-sm / text-base). If a literal is genuinely\n' +
      'required, add `// token-ok: <reason>` on the line (or the line above), or allowlist the file in\n' +
      'scripts/check-tokens.mjs. See AGENTS.md §46,63.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
