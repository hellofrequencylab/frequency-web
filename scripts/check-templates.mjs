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
// SHELLS below lists the 13 names that OWN A LAYOUT: the 7 authoring shells, the 3 entity
// compositions, SparkShell, 2 aliases reached by path, and MarketHero (the editable-index header,
// §8.5). COMPOSITIONS adds a few named, verified frames outside the kit that wrap one of them. That is deliberately WIDER than the
// authoring menu in PAGE-FRAMEWORK.md, because this gate answers "does this page own a layout", not
// "which shell should I pick". (This comment said "the eight real shells" until 2026-09-05, which
// was wrong twice over: the list holds 11, and an older AGENTS.md restatement counted RailGrid.)
// The pieces are named in PIECES purely so a future reader does not "fix" the omission.
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
// It also matches the shell by its LITERAL TAG NAME, so every indirection is invisible to it:
// an aliased import (`import { DetailTemplate as Shell }`), a shell held in a variable or chosen
// by a ternary, a namespace form (`<T.DetailTemplate>`), a renamed default import,
// `createElement(DetailTemplate)`, and `dynamic(() => import(...))`. A page composing a shell
// through any of those reads as BARE and inflates the count. That direction is deliberate: the
// error can only over-report debt, never certify a hand-rolled layout as compliant, so the
// baseline stays a safe ceiling. If a real page trips this, compose the tag directly rather than
// teaching the regex to chase indirection.
//
// ⚠️ A COUNT IS NOT A SET (2026-08-12). This gate used to be `export const BASELINE = 60` — a bare
// number — and that had the two defects ADR-1007 named for the migration ledger:
//   · it could not say WHICH page was new, so every failure printed all 61 paths with none marked
//     and cost a manual diff to read;
//   · one page adopting a template and one new bare page NET TO ZERO and it stayed green, so a
//     fresh violation walked in unseen behind a stable total.
// The baseline is now a SET of paths (scripts/templates-baseline.txt), so a failure names only the
// delta, and a swap can no longer hide inside a stable count. Copied wholesale from
// scripts/check-admin-client.mjs, which was already doing this correctly in the same directory.
//
// Usage: `node scripts/check-templates.mjs` (or `pnpm check:templates`). Exits 1 when a page that
// is NOT on the baseline composes no shell. Pages that left the list are reported so it can shrink.
//   node scripts/check-templates.mjs --update                 # after converting pages (shrink)
//   node scripts/check-templates.mjs --update --allow-raise --reason="..."   # to ADD a bare page

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { invokedDirectly } from './lib/invoked-directly.mjs'

const ROOT = 'app'

/** Top-level directories that are NOT governed by the template kit, each with its reason. A page
 *  under one of these is following ANOTHER design system that the change-over restyles at its own
 *  source, not hand-rolling around this one.
 *
 *    · (marketing) — the marketing block system (PAGE-FRAMEWORK §10): Loom modules and the
 *      components/marketing kit. A marketing page hand-rolling its own hero is following ITS system.
 *    · sites       — the Space-website theme system: a Space's external site renders the one SitePage
 *      inside the site's own chrome and theme, never an app shell.
 *    · print       — print sheets: paper layout, no page chrome at all.
 *    · dev         — local-only developer harnesses, never served in production.
 *    · for         — the persona landing pages, part of the marketing system above.
 *
 *  WIDENED 2026-10-13 (the design-switch program, ADR-1737): 'discover', '(capture)', 'hosted' and
 *  'spotlight' used to be skipped too. They are governed now, because a page this gate does not see
 *  is a page the one-env-var change-over cannot reach. What they hold that genuinely belongs to
 *  another system (the marketing-kit discover landings, a Space's site on its own domain, a member's
 *  themed Spotlight) is BASELINED with its reason in scripts/templates-baseline.txt rather than
 *  skipped, so a new hand-rolled page under those trees still fails.
 *
 *  ⚠️ This is NOT the same set as check-headers.mjs's SKIP_DIRS. Two real differences, both
 *  deliberate:
 *    · CONTENTS — check-headers skips '(marketing)', 'sites', 'print', 'discover'; this skips five
 *      different names (above), and governs discover.
 *    · DEPTH — check-headers matches a skipped name at ANY path segment (check-headers.mjs:104
 *      in the walk, :142 in isRouteModule); this matches only at the top level (`dir === ROOT`),
 *      so a nested directory that happens to share a name is still governed.
 *  Widening either set is a scope change to that gate's baseline, so do not "unify" them without
 *  re-freezing both numbers. */
export const SKIP_DIRS = new Set(['(marketing)', 'sites', 'print', 'dev', 'for'])

/** The real shells. A page composing any of these has a layout; anything else does not. */
export const SHELLS = [
  'IndexTemplate',
  'StreamTemplate',
  'DetailTemplate',
  'EventDetailTemplate',
  // The entity composition for Journeys (a DetailTemplate wrapper, not a twelfth shell). Added with
  // the two Journey detail pages that stopped hand-rolling the same interior grid twice.
  'JourneyDetailTemplate',
  'FocusTemplate',
  'WizardShell',
  // The Studio's wizard shell (ADR-986). The direct analogue of WizardShell for a Spark: it owns
  // the centered column, the progress cue, the heading lockup, and the Back/Continue footer.
  'SparkShell',
  'DashboardTemplate',
  'AdminTemplate',
  // Aliases: AdminPage re-exports AdminTemplate (components/admin/admin-page.tsx); the listing
  // template is imported by path rather than through the barrel.
  'AdminPage',
  'ListingDetailTemplate',
  // The editable index's header (PAGE-FRAMEWORK §8.5): a sanctioned composition, not drift. It is a
  // thin wrapper over the kit's PageHero, the same one IndexTemplate's heroOverlay renders, and the
  // body under it is operator-rearrangeable (BlockRender / PageModules). Counted from 2026-10-13 when
  // discover/ joined the governed scope and /discover/spaces turned out to compose it.
  'MarketHero',
]

/** REGISTERED COMPOSITIONS: named components OUTSIDE the template kit that exist to put a page on a
 *  shell, mapped to the file that defines them. A page rendering one composes that shell exactly as a
 *  page rendering <JourneyDetailTemplate> composes DetailTemplate.
 *
 *  This is NOT the regex chasing indirection (see the header): each entry is a NAME a reviewer can
 *  read, and the gate VERIFIES at run time that its file still renders a shell tag from SHELLS
 *  (`compositionDrift`). A composition that stops composing fails the gate rather than quietly
 *  certifying every page that uses it. Add one only for a component whose JOB is that frame; a page
 *  helper that happens to render a shell does not belong here. */
export const COMPOSITIONS = {
  // The public lead-capture card (front doors 2 to 5): a centered card around FocusTemplate.
  CaptureShell: 'components/crm/leads/capture-shell.tsx',
  // The /unsubscribe card every state renders inside (confirm, done, invalid, preference center).
  UnsubscribeFrame: 'app/unsubscribe/card.tsx',
  // The podcast show page, shared by the public and in-app routes: DetailTemplate with a show band.
  ShowPageView: 'components/airwaves/show-page-view.tsx',
  // The onboarding wizard and the persona sequence runner: both are WizardShell walks.
  OnboardingForm: 'app/onboarding/form.tsx',
  SequenceRunner: 'components/onboarding/sequence-runner.tsx',
  // The Space console's page templates (ADR-1737): under DAWN each IS FocusTemplate / DashboardTemplate with
  // the same props; under Frequency the console shell's AdminPageFrame. Both render the DAWN shell tag.
  ConsoleFocusTemplate: 'components/templates/console-templates.tsx',
  ConsoleDashboardTemplate: 'components/templates/console-templates.tsx',
}

/** Exported by the SAME barrel and deliberately NOT shells. Listed so the distinction is explicit
 *  rather than implied by omission — this is the exact confusion that made the old number wrong. */
export const PIECES = ['PageHeading', 'PageHero', 'WizardProgress', 'AdminSection', 'RailGrid']

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

/** Source with every comment blanked, read the way the parser reads it: one pass that knows
 *  strings and both comment kinds. Three regexes in sequence got this wrong twice over: a `/*` inside
 *  a `//` line (a comment saying "/admin/*") opened a block that swallowed the shell tag below it, and
 *  `https://` inside a string looked like a line comment. Newlines are kept so nothing else shifts. */
export function stripComments(src) {
  let out = ''
  let i = 0
  let quote = null
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (quote) {
      out += c
      if (c === '\\') { out += n ?? ''; i += 2; continue }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && n === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++ }
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}

/** Does this file's own source compose a shell? Comment-blind on purpose: a shell named in a
 *  comment is not a shell rendered, and this is the same reason check:tokens strips comments. */
export function composesShell(src) {
  const code = stripComments(src)
  // An import is not enough on its own — it must also be RENDERED as a tag. `<AdminTemplate`
  // catches the composition; a bare `import { AdminTemplate }` that is never used does not.
  return SHELLS.some((s) => new RegExp(`<${s}\\b`).test(code))
}

/** Does this page compose a shell directly OR through a registered composition? Kept separate from
 *  composesShell so the composition files themselves are checked against the core SHELLS only (a
 *  composition cannot certify itself by naming another composition). */
export function composesPageShell(src) {
  if (composesShell(src)) return true
  const code = stripComments(src)
  return Object.keys(COMPOSITIONS).some((c) => new RegExp(`<${c}\\b`).test(code))
}

/** Registered compositions whose file no longer renders a shell (or no longer exists). */
export function compositionDrift(read = (f) => readFileSync(f, 'utf8'), exists = existsSync) {
  return Object.entries(COMPOSITIONS)
    .filter(([, file]) => !exists(file) || !composesShell(read(file)))
    .map(([name, file]) => `${name} (${file})`)
}

/** Walk up from a page to app/, asking each layout.tsx whether it composes a shell.
 *  @param {string} pagePath
 *  @param {(f: string) => string} [read] repo-relative reader (the default hits the filesystem)
 *  @param {(f: string) => boolean} [exists] repo-relative probe */
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

/** Does this file contain anything that could be a JSX tag? A redirect/notFound stub does not, and
 *  owes no shell. A `<` directly after an identifier, `.`, `)` or `]` is a type argument or a
 *  comparison (`Record<…>`, `Array<string>`, `a < b`), never a tag, so it is skipped; that used to
 *  count six redirect pages as bare. Still over-inclusive in the safe direction: anything else that
 *  opens like a tag is considered, so the number can be too HIGH, never hide a real bare page. */
export function rendersJsx(src) {
  const code = stripComments(src)
  for (const m of code.matchAll(/<[A-Za-z]/g)) {
    let j = m.index - 1
    while (j >= 0 && /\s/.test(code[j])) j--
    if (j >= 0 && /[\w$]/.test(code[j])) {
      // An identifier before the `<` is a type argument, unless the word is a keyword that can lead
      // an expression (`return <Page />`).
      let k = j
      while (k >= 0 && /[\w$]/.test(code[k])) k--
      if (!/^(return|yield|await|default|case|in|of|typeof|void)$/.test(code.slice(k + 1, j + 1))) continue
    } else if (j >= 0 && /[.)\]]/.test(code[j])) continue
    return true
  }
  return false
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
    if (composesPageShell(src)) continue
    if (ancestorComposes(p, read, exists)) continue
    bare.push(p.split('\\').join('/'))
  }
  return { total: list.length, considered, bare: bare.sort() }
}

/** A gate that scans nothing reports a clean bill of health. Same pattern as MIN_ROWS in
 *  check-gate-parity.mjs, which shipped after that gate printed "0 of 0 ✓" and exited 0.
 *
 *  Compare the floor against the right number: `pages()` returns the SKIP_DIRS-filtered walk, which
 *  is **313** on 2026-08-11, not the 383 page.tsx files that exist under app/ in total. 150 leaves
 *  roughly half the filtered corpus as headroom for legitimate route deletion while still catching
 *  a walk that silently collapses. */
export const MIN_PAGES = 150

/** The baseline SET: one path per line, sorted, `#` comments ignored. Frozen 2026-08-11 at the
 *  measured value (313 in-app page.tsx, 290 rendering JSX, 58 composing no shell), re-frozen to 60
 *  by ADR-986, and converted from a bare count to this file on 2026-08-12.
 *
 *  RATCHET: it may only shrink. Deliberately not a hard zero — converting a page is a per-page
 *  judgement about which template the content actually IS, which is a design call and not a codemod.
 *  What the freeze buys is that the class stops GROWING meanwhile, the property it never had.
 *
 *  ⚠️ The number here is NOT the "84" or the "38" that circulated in the plan, and the difference is
 *  the method, not the tree:
 *    · scope — those counted all of app/; this counts only what the framework governs (SKIP_DIRS),
 *      because a marketing page hand-rolling a hero is following its own system.
 *    · evidence — those counted an IMPORT of a shell; this requires the shell to be RENDERED
 *      (`<AdminTemplate`). A page that imports one and never uses it is not composing it.
 *  Re-measure with `node scripts/check-templates.mjs`, never by grep. */
export const BASELINE_FILE = join('scripts', 'templates-baseline.txt')

export function loadBaseline(read = (f) => readFileSync(f, 'utf8')) {
  return new Set(
    read(BASELINE_FILE)
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean),
  )
}

/** The leading comment block of the templates baseline, preserved verbatim (SCAN-537). Falls back
 *  to BASELINE_HEADER when the file is missing or starts straight in on entries. */
function readBaselineHeader() {
  let src
  try {
    src = readFileSync(BASELINE_FILE, 'utf8')
  } catch {
    return BASELINE_HEADER
  }
  const lines = src.split('\n')
  const end = lines.findIndex((l) => l.trim() !== '' && !l.startsWith('#'))
  if (end <= 0) return BASELINE_HEADER
  return lines.slice(0, end).join('\n') + '\n'
}

const BASELINE_HEADER =
  '# check:templates baseline — every in-app page.tsx that renders JSX and composes NO kit shell,\n' +
  '# in the page itself or any ancestor layout (PAGE-FRAMEWORK §3). A SET, not a count: a page\n' +
  '# adopting a template and a new bare page arriving can no longer net to zero and stay green.\n' +
  '#\n' +
  '# RATCHET: this list may only SHRINK. Convert a page to a template, then regenerate:\n' +
  '#   node scripts/check-templates.mjs --update\n' +
  '# Adding a bare page is a deliberate, reviewable act and needs a reason the diff carries:\n' +
  '#   node scripts/check-templates.mjs --update --allow-raise --reason="why"\n' +
  '#\n' +
  '# ⚠️ Three entries are compliant pages the gate cannot see (ADR-986): app/(main)/classifieds/new,\n' +
  '# app/(main)/spaces/[slug]/settings/services/new and app/(main)/market/sell are SERVER pages that\n' +
  '# gate and then delegate to a client Spark which composes SparkShell. The gate matches literal tags\n' +
  '# in the page file by design — it over-reports rather than certifying a hand-rolled layout — so they\n' +
  '# are listed here. market/sell joined them on 2026-08-24 (ADR-914 / OWN-032): its FocusTemplate was\n' +
  '# the upgrade WALL, so opening the Market to free members removed the composition with it.\n' +
  '#\n' +
  '# ⚠️ Six entries are PRESENTATIONS of a page, not pages (ADR-1017): the app/(main)/@wizard/(.)…\n' +
  '# intercepting routes. Each one imports and renders the SAME page module its real route serves,\n' +
  '# wrapped in the Spark modal, so the kit shell is composed by the page underneath and by the\n' +
  '# wizard\'s own SparkShell. There is no second layout here to convert: giving one a template would\n' +
  '# put a page header inside a dialog. They are BASELINED rather than excluded from the walk on\n' +
  '# purpose — a future slot page that really does hand-roll a layout must still fail this gate.\n'

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

  const drift = compositionDrift()
  if (drift.length > 0) {
    console.error(
      '✗ check:templates: registered composition(s) no longer render a kit shell:\n' +
        drift.map((d) => `    - ${d}`).join('\n') +
        '\n  Restore the shell in that file, or remove it from COMPOSITIONS and baseline its pages.',
    )
    process.exit(1)
  }

  const { total, considered, bare } = evaluate({ pages: list })

  if (process.argv.includes('--update')) {
    // A ratchet must be ASYMMETRIC or it is just a snapshot. Same shape as check-admin-client.mjs:
    // shrinking is free, growing needs --allow-raise and a reason the reviewer can read.
    const prior = (() => { try { return loadBaseline() } catch { return new Set() } })()
    const rising = bare.filter((p) => !prior.has(p))
    const allowRaise = process.argv.includes('--allow-raise')
    const reasonArg = process.argv.find((a) => a.startsWith('--reason='))
    const reason = reasonArg ? reasonArg.slice('--reason='.length).trim() : ''
    if (rising.length > 0 && prior.size > 0 && !allowRaise) {
      console.error(
        `✗ templates baseline: refusing to RAISE by ${rising.length} page(s).\n` +
          rising.map((p) => `    + ${p}`).join('\n') +
          '\n  Each of these hand-rolls a layout the kit already owns. If that is intended:\n' +
          '    node scripts/check-templates.mjs --update --allow-raise --reason="why"',
      )
      process.exit(1)
    }
    if (rising.length > 0 && prior.size > 0 && reason.length < 12) {
      console.error('✗ templates baseline: --allow-raise needs --reason="..." (>= 12 chars).')
      process.exit(1)
    }
    // PRESERVE any leading comment block rather than regenerating BASELINE_HEADER (SCAN-537).
    // This file's header happens to round-trip today only because it is still byte-identical to the
    // constant and nobody has hand-annotated an entry. The moment someone writes a per-entry reason
    // here — which is the natural thing to do — the next --update would silently eat it, exactly as
    // the admin-client baseline's did. Fixing the shape before it has damage is the cheap version.
    writeFileSync(BASELINE_FILE, readBaselineHeader() + bare.join('\n') + '\n')
    console.log(`✓ templates baseline regenerated: ${bare.length} bare page(s)`)
    return
  }

  const baseline = loadBaseline()
  const current = new Set(bare)
  const added = bare.filter((p) => !baseline.has(p))
  const removable = [...baseline].filter((p) => !current.has(p)).sort()

  if (added.length > 0) {
    console.error(`\n✗ check:templates: ${added.length} NEW page(s) compose no kit shell:\n`)
    for (const p of added) console.error(`    - ${p}`)
    console.error(
      '\n  Pick a template from @/components/templates by WHAT THE CONTENT IS and fill its slots\n' +
        '  (PAGE-FRAMEWORK §3): Stream, Index, Detail, Dashboard, Focus. Importing PageHeading or\n' +
        '  AdminSection is not composing a shell — those are pieces. If the page genuinely composes\n' +
        '  one through a delegated client component the gate cannot see, add it in this PR:\n' +
        '    node scripts/check-templates.mjs --update --allow-raise --reason="why"\n',
    )
    process.exit(1)
  }

  console.log(
    `✓ Template contract: ${considered} of ${total} page(s) are considered (not redirect stubs); ` +
      `${considered - bare.length} compose a kit shell directly or through an ancestor layout, ` +
      `${bare.length} do not (baseline ${baseline.size}, may only shrink).` +
      (removable.length
        ? `\n  ${removable.length} baseline entr(ies) now compose a shell — shrink the baseline:` +
          '\n    node scripts/check-templates.mjs --update' +
          removable.map((p) => `\n      - ${p}`).join('')
        : ''),
  )
}

if (invokedDirectly(import.meta.url)) main()
