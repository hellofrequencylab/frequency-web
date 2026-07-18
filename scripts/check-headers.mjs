#!/usr/bin/env node
// Header contract check (PAGE-FRAMEWORK §3,§8 · AGENTS.md "Page framework").
//
// Every interior page COMPOSES the kit: its header comes from PageHeading (or a template that
// renders one), never a hand-rolled `<h1>`. This guard fails a PR whose in-app page.tsx declares
// its own page-level `<h1>` element instead of composing the shared header grammar.
//
// Scope: app/(main)/**/page.tsx only. The OTHER route groups are deliberately out of scope — they
// are separate systems with their own header conventions: app/(marketing), app/sites, app/print,
// app/discover. (Those live OUTSIDE app/(main), so walking (main) already excludes them; the guard
// also refuses to descend into them defensively.)
//
// Heuristic — a literal `<h1>` in a page's OWN JSX is the "header outside a template" we forbid: a
// page that composes the kit uses <PageHeading …/> (which renders the h1 internally) and a template
// renders its own h1 in a SEPARATE component file, so a page.tsx never legitimately contains a raw
// `<h1>`. Detection is comment- and string-aware (a `<h1>` mentioned in a doc comment or a string is
// NOT markup and never flagged), which is why keying on the raw element beats the coarse
// "does it import a template?" proxy — a page can import DetailTemplate for its BODY yet still
// hand-roll an `<h1>` header (exactly the podcast-show case), and only the element check catches it.
//
// Escape hatch: an inline `// header-ok: <reason>` (or, inside JSX, a `{/* header-ok: … */}` block
// comment) on the `<h1>` line or the line directly above it, for a genuinely special surface (e.g. a
// bespoke chat/takeover pane, MEMBER-DESIGN-SYSTEM §207).
//
// Usage: `node scripts/check-headers.mjs` (or `pnpm check:headers`). Exits 1 on violation, printing
// file:line so CI fails the PR. Model: scripts/check-menu.mjs + scripts/check-tokens.mjs.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = join('app', '(main)')
const ANNOTATION = /\/\/\s*header-ok:|\/\*\s*header-ok\b/
// Separate systems that own their own header conventions — never descend into them.
const SKIP_DIRS = new Set(['(marketing)', 'sites', 'print', 'discover'])
// A real page-level <h1> element: `<h1` followed by whitespace, `>`, or a self-close `/`.
const H1 = /<h1[\s/>]/

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || SKIP_DIRS.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name === 'page.tsx') out.push(p)
  }
  return out
}

/** Blank out comment + string bodies (keeping line count) so a `<h1>` in a doc comment or a string
 *  literal is never mistaken for markup. Same string-aware scan as check-tokens' stripComments. */
export function stripCommentsAndStrings(src) {
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
        if (c === '\\') { s += '  '; if (n !== undefined) i++; continue }
        if (c === str) { str = ''; s += ' '; continue }
        s += ' '
        continue
      }
      if (c === '/' && n === '/') { s += ' '.repeat(raw.length - i); break } // line comment
      if (c === '/' && n === '*') { inBlock = true; i++; s += '  '; continue }
      if (c === "'" || c === '"' || c === '`') { str = c; s += ' '; continue }
      s += c
    }
    out.push(s)
  }
  return out
}

/** Pure classifier — exported for the companion test. Returns {line, text} for each hand-rolled
 *  page-level <h1> in one file's source. */
export function headerViolations(src) {
  const rawLines = src.split('\n')
  const codeLines = stripCommentsAndStrings(src)
  const out = []
  for (let i = 0; i < codeLines.length; i++) {
    if (!H1.test(codeLines[i])) continue
    // Escape hatch on the <h1> line or the line directly above it (checked on RAW text).
    if (ANNOTATION.test(rawLines[i])) continue
    if (i > 0 && ANNOTATION.test(rawLines[i - 1])) continue
    out.push({ line: i + 1, text: rawLines[i].trim() })
  }
  return out
}

export function runCheck() {
  const violations = []
  for (const f of walk(ROOT)) {
    const rel = f.split('\\').join('/')
    for (const v of headerViolations(readFileSync(f, 'utf8'))) violations.push({ file: rel, ...v })
  }
  return violations
}

function main() {
  const violations = runCheck()
  if (violations.length === 0) {
    console.log('✓ Header contract: in-app pages compose PageHeading/a template (no hand-rolled page-level <h1>).')
    return
  }
  console.error('\n✗ Header contract check failed — an in-app page hand-rolls a page-level <h1> instead of composing the kit:\n')
  for (const v of violations) {
    console.error(`  • ${v.file}:${v.line} — hand-rolled <h1>\n      ${v.text}`)
  }
  console.error(
    '\nHeaders come from PageHeading (or a template that renders one) — never a raw <h1> (PAGE-FRAMEWORK\n' +
      '§3,§8). Compose <PageHeading title=… /> or the right template from @/components/templates. If this is\n' +
      'a genuinely bespoke surface (e.g. a chat/takeover pane), add `// header-ok: <reason>` on the <h1>\n' +
      'line or the line above. See docs/PAGE-FRAMEWORK.md.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
