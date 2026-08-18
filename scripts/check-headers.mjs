#!/usr/bin/env node
// Header contract check (PAGE-FRAMEWORK §3,§8 · AGENTS.md "Page framework").
//
// Every interior page COMPOSES the kit: its header comes from PageHeading (or a template that
// renders one), never a hand-rolled `<h1>`. This guard fails a PR whose in-app route declares
// its own page-level `<h1>` element instead of composing the shared header grammar.
//
// Scope: the app/(main) route group. The OTHER route groups are deliberately out of scope — they
// are separate systems with their own header conventions: app/(marketing), app/sites, app/print,
// app/discover. (Those live OUTSIDE app/(main), so walking (main) already excludes them; the guard
// also refuses to descend into them defensively.)
//
// ---------------------------------------------------------------------------------------------
// DELEGATION — added 2026-08-05 (Phase 9, docs/DAWN-CONVERSION.md §4).
// ---------------------------------------------------------------------------------------------
// The first version walked `page.tsx` ONLY, which assumes the heading is inline. It usually is:
// components/templates/page-heading.tsx renders the canonical `<h1>` and the overwhelming majority
// of routes take its default. But a page is free to hand its whole header to a co-located client
// island — `return <EventSpark …/>` — and that `<h1>` was invisible to the gate. THREE hand-rolled
// page headers were living in that gap (see KNOWN_DELEGATED below); none of them could ever have
// failed CI, and nothing in the gate's green output hinted that it had not looked.
//
// So the gate now starts at every ROUTE ENTRY (`page.tsx` AND `layout.tsx` — a layout owns its
// subtree's chrome and can just as easily hand-roll the h1) and FOLLOWS the route's own imports:
// the co-located modules a route delegates to. It reports the delegating route alongside the file,
// so the failure is actionable rather than a bare path.
//
// Where the follow STOPS, and why that is a boundary rather than a blind spot:
//   * `components/**` and `lib/**` are NOT followed. Those are shared components with their own
//     header conventions and their own owner — the same reason the other route groups are skipped.
//     A shared component is imported by many routes, so following into it would report one file
//     N times and turn this gate into a component census. Hand-rolled headers inside the shared
//     wizard/spark components are a known, separate population, swept in DAWN Phase 3.
//   * Route groups outside `app/(main)` are not followed, for the reason in the Scope note above.
//
// Heuristic — a literal `<h1>` in a route's OWN JSX is the "header outside a template" we forbid: a
// page that composes the kit uses <PageHeading …/> (which renders the h1 internally) and a template
// renders its own h1 in a SEPARATE component file, so a route module never legitimately contains a
// raw `<h1>`. Detection is comment- and string-aware (a `<h1>` mentioned in a doc comment or a
// string is NOT markup and never flagged), which is why keying on the raw element beats the coarse
// "does it import a template?" proxy — a page can import DetailTemplate for its BODY yet still
// hand-roll an `<h1>` header (exactly the podcast-show case), and only the element check catches it.
//
// Escape hatch: an inline `// header-ok: <reason>` (or, inside JSX, a `{/* header-ok: … */}` block
// comment) on the `<h1>` line, or anywhere in the comment block directly above it, for a genuinely
// special surface (e.g. a bespoke chat/takeover pane, MEMBER-DESIGN-SYSTEM §207). The whole block
// counts because a reason worth writing rarely fits on one line.
//
// Usage: `node scripts/check-headers.mjs` (or `pnpm check:headers`). Exits 1 on violation, printing
// file:line so CI fails the PR. Model: scripts/check-menu.mjs + scripts/check-tokens.mjs.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = join('app', '(main)')
const ANNOTATION = /\/\/\s*header-ok:|\/\*\s*header-ok\b/
// Inside a comment BLOCK above the element, the token needs no opener beside it — the line has
// already been proven to be comment-only (it blanks to nothing but punctuation). Requiring `//` or
// `/*` there meant the token only worked on a block's FIRST line, so a three-line reason silently
// stopped annotating anything the moment someone put the summary sentence on line two.
const ANNOTATION_IN_COMMENT = /\bheader-ok\b/
// Separate systems that own their own header conventions — never descend into them.
const SKIP_DIRS = new Set(['(marketing)', 'sites', 'print', 'discover'])
// A real page-level <h1> element: `<h1` followed by whitespace, `>`, or a self-close `/`.
// `|$` matters — the scan is PER LINE, so a `\s` class cannot match the newline after a bare
// `<h1` that carries its attributes on the following lines. That is the shape PageHeading itself
// is written in, and it was the second thing this gate could not see: a multi-line `<h1` opening
// tag (app/(main)/spaces/[slug]/(profile)/layout.tsx) scored zero under `/<h1[\s\/>]/`.
const H1 = /<h1(?:[\s/>]|$)/
// Route entry points. A layout owns its subtree's chrome, so it can hand-roll the h1 as easily
// as a page can; walking pages alone left the Space-profile hero unwatched.
const ENTRY_FILES = new Set(['page.tsx', 'layout.tsx'])
// How far to chase delegation. A route hands off to an island, which may hand off once more;
// past that the module is doing something other than rendering the page header.
const MAX_DEPTH = 3

// ---------------------------------------------------------------------------------------------
// KNOWN_DELEGATED — the three hand-rolled page headers the delegation walk found on the day it
// was added (2026-08-05). They are NOT excused: they are NAMED, so the gate is green over three
// dated, reviewable lines in this file rather than green over a hole it could not see. The list
// may only SHRINK — retiring an entry onto PageHeading and deleting its line here is the whole
// job, and a line whose file no longer hand-rolls an h1 FAILS as a stale entry, so it cannot rot
// into a permanent exemption. Anything not on this list fails on sight.
// ---------------------------------------------------------------------------------------------
export const KNOWN_DELEGATED = new Map([
  [
    'app/(main)/events/new/event-form.tsx',
    'the "Create an event" instructional band hand-rolls the page h1 at text-body; /events/new and /events/[slug]/edit both delegate their header to it. Retire onto PageHeading.',
  ],
  [
    'app/(main)/admin/walkthroughs/[id]/editor.tsx',
    'the Walkthrough editor hand-rolls back-link + h1 + actions, which is exactly PageHeading\u2019s back/title/actions slot set.',
  ],
])

function walkEntries(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || SKIP_DIRS.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walkEntries(p, out)
    else if (ENTRY_FILES.has(e.name)) out.push(p)
  }
  return out
}

const posix = (p) => p.split('\\').join('/')

/** Every `import …` / `export … from` specifier in a source file. */
export function importSpecifiers(src) {
  const out = []
  const re = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(src)) !== null) out.push(m[1])
  return out
}

/**
 * Resolve a first-party import to a repo-relative file, or null. Only `@/…` and relative
 * specifiers resolve; a bare package name is third-party and never a route module.
 * @param {string} spec
 * @param {string} fromFile
 * @param {(f: string) => boolean} [exists] repo-relative probe
 */
export function resolveImport(spec, fromFile, exists = existsSync) {
  let base
  if (spec.startsWith('@/')) base = spec.slice(2)
  else if (spec.startsWith('.')) base = posix(relative(process.cwd(), resolve(dirname(fromFile), spec)))
  else return null
  for (const cand of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (exists(cand)) return posix(cand)
  }
  return null
}

/** Is `file` a module this gate governs — i.e. co-located inside the app/(main) route group? */
export function isRouteModule(file) {
  const p = posix(file)
  if (!p.startsWith('app/(main)/')) return false
  return !p.split('/').some((seg) => SKIP_DIRS.has(seg))
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
    // Escape hatch on the <h1> line, or anywhere in the comment block directly above it (checked
    // on RAW text). "The line directly above" was too literal: a reason worth writing usually runs
    // to two or three lines, and only its FIRST line carries the `header-ok:` token — so a
    // correctly-annotated, well-explained h1 still failed while a terse one passed. A comment line
    // carries no alphanumerics once its body is blanked (a JSX `{/* … */}` leaves only its braces),
    // so "no letters or digits left" is exactly how far up the block reaches, and it stops dead at
    // the first line of real code.
    let annotated = ANNOTATION.test(rawLines[i])
    for (let k = i - 1; !annotated && k >= 0 && i - k <= 10 && !/[A-Za-z0-9]/.test(codeLines[k]); k--) {
      annotated = ANNOTATION_IN_COMMENT.test(rawLines[k])
    }
    if (annotated) continue
    out.push({ line: i + 1, text: rawLines[i].trim() })
  }
  return out
}

/**
 * Walk a route entry and the co-located modules it delegates to.
 * @param {string[]} entries
 * @param {(f: string) => string} [read] repo-relative reader (the default hits the filesystem)
 * @param {(f: string) => boolean} [exists] repo-relative probe
 * @returns {Map<string, string>} module path → the route entry that reaches it (itself, for entries)
 */
export function delegationClosure(entries, read = (f) => readFileSync(f, 'utf8'), exists = existsSync) {
  const reachedBy = new Map()
  for (const entry of entries) {
    const rel = posix(entry)
    const stack = [[rel, 0]]
    const seen = new Set()
    while (stack.length > 0) {
      const [file, depth] = stack.pop()
      if (seen.has(file)) continue
      seen.add(file)
      if (!reachedBy.has(file)) reachedBy.set(file, rel)
      if (depth >= MAX_DEPTH) continue
      let src
      try { src = read(file) } catch { continue }
      for (const spec of importSpecifiers(src)) {
        const target = resolveImport(spec, file, exists)
        if (target && isRouteModule(target) && !seen.has(target)) stack.push([target, depth + 1])
      }
    }
  }
  return reachedBy
}

export function runCheck() {
  const entries = walkEntries(ROOT)
  const reachedBy = delegationClosure(entries)
  const violations = []
  const known = []
  for (const [file, via] of reachedBy) {
    let src
    try { src = readFileSync(file, 'utf8') } catch { continue }
    for (const v of headerViolations(src)) {
      const row = { file, via: via === file ? null : via, ...v }
      if (KNOWN_DELEGATED.has(file)) known.push(row)
      else violations.push(row)
    }
  }
  // A named entry whose file no longer hand-rolls an h1 must be DELETED, or the list rots into a
  // permanent exemption that nobody re-reads.
  const stale = [...KNOWN_DELEGATED.keys()].filter((f) => !known.some((k) => k.file === f))
  return { violations, known, stale, scanned: reachedBy.size, entries: entries.length }
}

/** `check:headers` already fails on a stale KNOWN_DELEGATED entry, which is real protection and is
 *  why it exited 1 from an empty tree by accident. That is a side effect of allowlist-rot
 *  detection, though, not a floor: tidy the allowlist to empty and an under-scan goes silent
 *  again. Measured 305 route entries / 675 modules on 2026-08-10. */
const MIN_ROUTE_ENTRIES = 150
const MIN_SCANNED_MODULES = 300

function main() {
  const { violations, known, stale, scanned, entries } = runCheck()

  if (entries < MIN_ROUTE_ENTRIES || scanned < MIN_SCANNED_MODULES) {
    console.error(
      `✗ Header contract walked only ${entries} route entr(ies) and ${scanned} module(s), expected ` +
        `at least ${MIN_ROUTE_ENTRIES} and ${MIN_SCANNED_MODULES}.\n  The route walk or the ` +
        'delegation closure is broken, so its silence about hand-rolled headers means nothing.',
    )
    process.exit(1)
  }

  console.log(
    `Header contract — ${entries} route entr${entries === 1 ? 'y' : 'ies'} under app/(main), ` +
      `${scanned} module(s) after following delegation.`,
  )
  for (const k of known) {
    console.warn(`  ⚠ known hand-rolled header: ${k.file}:${k.line}${k.via ? ` (delegated from ${k.via})` : ''}`)
    console.warn(`      ${KNOWN_DELEGATED.get(k.file)}`)
  }

  if (violations.length === 0 && stale.length === 0) {
    console.log(
      `✓ Header contract: in-app routes compose PageHeading/a template — no NEW hand-rolled page-level <h1>` +
        (known.length ? ` (${known.length} known, named above, list may only shrink).` : '.'),
    )
    return
  }

  if (stale.length > 0) {
    console.error('\n✗ Header contract check failed — a KNOWN_DELEGATED entry no longer hand-rolls an <h1>:\n')
    for (const f of stale) console.error(`  • ${f} — retired (or moved). Delete its line from KNOWN_DELEGATED in scripts/check-headers.mjs.`)
  }

  if (violations.length > 0) {
    console.error('\n✗ Header contract check failed — an in-app route hand-rolls a page-level <h1> instead of composing the kit:\n')
    for (const v of violations) {
      console.error(`  • ${v.file}:${v.line} — hand-rolled <h1>${v.via ? `\n      (delegated from ${v.via})` : ''}\n      ${v.text}`)
    }
    console.error(
      '\nHeaders come from PageHeading (or a template that renders one) — never a raw <h1> (PAGE-FRAMEWORK\n' +
        '§3,§8). Compose <PageHeading title=… /> or the right template from @/components/templates. If this is\n' +
        'a genuinely bespoke surface (e.g. a chat/takeover pane), add `// header-ok: <reason>` on the <h1>\n' +
        'line or the line above. See docs/PAGE-FRAMEWORK.md.\n',
    )
  }
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
