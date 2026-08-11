#!/usr/bin/env node
// check:templates — every in-app page composes a kit SHELL, and the count may only shrink.
//
// WHY THIS EXISTS. PAGE-FRAMEWORK §3 says to pick a template and fill its slots rather than
// hand-rolling a layout. Every other design-debt class in this repo has an instrument behind it
// (scripts/adoption-baselines.json, check:headers, check:tokens). This one had none — no gate, no
// baseline, no ratchet — and it is the one class whose number kept drifting in the plan docs:
// "242 of 383" did not reproduce, twice, because a hand grep is not a measurement.
//
// THE HOLE A NAIVE GREP FALLS INTO. `grep -l "@/components/templates"` is NOT evidence of composing
// a template. That barrel also exports PIECES — PageHeading, PageHero, WizardProgress, AdminSection,
// RailGrid — and a page can import a piece, hand-roll its own layout around it, and score compliant.
// SHELLS below lists the eight real shells (plus two aliases reached by path); the pieces are named
// in PIECES purely so a future reader does not "fix" the omission.
//
// TWO WAYS TO BE COMPLIANT, and both are legitimate:
//   · the page itself composes a shell
//   · an ancestor layout.tsx composes it, and the page fills it (the Detail-composed-at-layout
//     pattern the Space profile tree uses — app/(main)/spaces/[slug]/(profile)/layout.tsx)
//
// WHAT THIS DOES NOT DO. It does not judge whether the shell chosen is the RIGHT one, and it does
// not resolve transitively (a page whose helper imports a shell off the render path is not
// compliant just for that). Direct-or-ancestor is the floor measurement: every page it reports
// cannot reach a shell by any route a reader would call composition.
//
// Usage: `node scripts/check-templates.mjs` (or `pnpm check:templates`). Exits 1 when the count
// RISES above the frozen baseline. Falling is reported and asks you to re-freeze.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = 'app'

/** Route groups that are NOT governed by the template kit, mirroring check-headers.mjs's SKIP_DIRS
 *  exactly so the two guards cannot disagree about what "in-app" means. PAGE-FRAMEWORK is explicit
 *  that templates govern "App routes behind auth (app/(main)/*)" and that the public marketing
 *  routes are a separate system with their own conventions (§ the Loom/module split table). A
 *  marketing page hand-rolling its own hero is following ITS system, not violating this one. */
const SKIP_DIRS = new Set(['(marketing)', '(capture)', 'sites', 'print', 'discover', 'dev', 'for', 'spotlight'])

/** The real shells. A page composing any of these has a layout; anything else does not. */
export const SHELLS = [
  'IndexTemplate',
  'StreamTemplate',
  'DetailTemplate',
  'EventDetailTemplate',
  'FocusTemplate',
  'WizardShell',
  'DashboardTemplate',
  'AdminTemplate',
  // Aliases: AdminPage re-exports AdminTemplate (components/admin/admin-page.tsx); the listing
  // template is imported by path rather than through the barrel.
  'AdminPage',
  'ListingDetailTemplate',
]

/** Exported by the SAME barrel and deliberately NOT shells. Listed so the distinction is explicit
 *  rather than implied by omission — this is the exact confusion that made the old number wrong. */
export const PIECES = ['PageHeading', 'PageHero', 'WizardProgress', 'AdminSection', 'RailGrid']

const SHELL_RE = new RegExp(`\\b(${SHELLS.join('|')})\\b`)

/** Every `page.tsx` under app/. */
export function pages(dir = ROOT, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    if (e.isDirectory() && dir === ROOT && SKIP_DIRS.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) pages(p, out)
    else if (e.name === 'page.tsx') out.push(p)
  }
  return out
}

/** Does this file's own source compose a shell? Comment-blind on purpose: a shell named in a
 *  comment is not a shell rendered, and this is the same reason check:tokens strips comments. */
export function composesShell(src) {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  // An import is not enough on its own — it must also be RENDERED as a tag. `<AdminTemplate`
  // catches the composition; a bare `import { AdminTemplate }` that is never used does not.
  return SHELLS.some((s) => new RegExp(`<${s}\\b`).test(code))
}

/** Walk up from a page to app/, asking each layout.tsx whether it composes a shell. */
export function ancestorComposes(pagePath, read = (f) => readFileSync(f, 'utf8'), exists = existsSync) {
  let dir = dirname(pagePath)
  for (;;) {
    const layout = join(dir, 'layout.tsx')
    if (exists(layout) && composesShell(read(layout))) return true
    if (dir === ROOT || dir === '.' || dir === '') return false
    const up = dirname(dir)
    if (up === dir) return false
    dir = up
  }
}

/** Pages that render JSX at all. A redirect/notFound stub owes no shell. */
export function rendersJsx(src) {
  return /<[A-Za-z]/.test(src)
}

export function evaluate(io = {}) {
  const read = io.read ?? ((f) => readFileSync(f, 'utf8'))
  const exists = io.exists ?? existsSync
  const list = io.pages ?? pages()
  const bare = []
  let considered = 0
  for (const p of list) {
    const src = read(p)
    if (!rendersJsx(src)) continue // redirect / notFound stub
    considered++
    if (composesShell(src)) continue
    if (ancestorComposes(p, read, exists)) continue
    bare.push(p.split('\\').join('/'))
  }
  return { total: list.length, considered, bare: bare.sort() }
}

/** A gate that scans nothing reports a clean bill of health. 383 page.tsx files live under app/ on
 *  2026-08-11; the floor sits well under that and far above zero. Same pattern as MIN_ROWS in
 *  check-gate-parity.mjs, which shipped after that gate printed "0 of 0 ✓" and exited 0. */
export const MIN_PAGES = 150

/** Frozen 2026-08-11 at the measured value: 313 in-app page.tsx, 290 rendering JSX, 58 of those
 *  composing no shell. RATCHET: may only fall. Deliberately not a hard zero — converting a page is
 *  a per-page judgement about which template the content actually IS, which is a design call and
 *  not a codemod. What the freeze buys is that the class stops GROWING meanwhile, the property it
 *  has never had.
 *
 *  ⚠️ This number is NOT the "84" or the "38" that circulated in the plan, and the difference is
 *  the method, not the tree:
 *    · scope — those counted all of app/; this counts only what the framework governs (SKIP_DIRS),
 *      because a marketing page hand-rolling a hero is following its own system.
 *    · evidence — those counted an IMPORT of a shell; this requires the shell to be RENDERED
 *      (`<AdminTemplate`). A page that imports one and never uses it is not composing it.
 *  Re-measure with `node scripts/check-templates.mjs`, never by grep. */
export const BASELINE = 58

function main() {
  const list = pages()
  if (list.length < MIN_PAGES) {
    console.error(
      `✗ check:templates found only ${list.length} page.tsx file(s) under ${ROOT}/, expected at ` +
        `least ${MIN_PAGES}. The walk is broken, so its silence about layout composition means ` +
        'nothing.',
    )
    process.exit(1)
  }

  const { total, considered, bare } = evaluate({ pages: list })

  if (bare.length > BASELINE) {
    console.error(
      `\n✗ Template adoption ROSE: ${bare.length} JSX page(s) compose no kit shell, baseline ` +
        `${BASELINE}.\n`,
    )
    console.error('  Pages with no shell, in the page itself or any ancestor layout:\n')
    for (const p of bare) console.error(`    ${p}`)
    console.error(
      '\n  Pick a template from @/components/templates by WHAT THE CONTENT IS and fill its slots\n' +
        '  (PAGE-FRAMEWORK §3): Stream, Index, Detail, Dashboard, Focus. Importing PageHeading or\n' +
        '  AdminSection is not composing a shell — those are pieces. Do NOT raise BASELINE.\n',
    )
    process.exit(1)
  }

  if (bare.length < BASELINE) {
    console.log(
      `✅ Template adoption FELL: ${bare.length} bare page(s), baseline ${BASELINE}. ` +
        'Re-freeze BASELINE in scripts/check-templates.mjs so it can only shrink again.',
    )
  }

  console.log(
    `✓ Template contract: ${considered} of ${total} page(s) render JSX; ${considered - bare.length} ` +
      `compose a kit shell directly or through an ancestor layout, ${bare.length} do not ` +
      `(baseline ${BASELINE}, may only fall).`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
