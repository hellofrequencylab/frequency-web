#!/usr/bin/env node
// PHANTOM CLASS GATE — a class the source writes that the compiler emits nothing for.
//
// WHY THIS EXISTS. Every other style check in this repo reads SOURCE: check:tokens greps for
// literals, check:adoption counts them, lint parses the AST. All of them prove a string is
// present. None proves it PAINTS. So `bg-surface-2` sails through every gate we own — it is
// a plausible Tailwind class, it is spelled consistently, tsc has no opinion about strings,
// and eslint has no idea which utilities exist. It just silently renders nothing, and the
// element loses its background with no error anywhere.
//
// Five of these were live when this script was written, found by compiling instead of reading:
//
//   bg-surface-2            practice-builder.tsx      (token is surface-elevated)
//   bg-surface-subtle       authoring-access-note.tsx (invented name)
//   border-line             admin-journeys-library.tsx(token is border)
//   border-primary-border   event-checkin.tsx         (no such token)
//   text-muted-foreground   discover/spaces/[type]    (shadcn's name, not ours)
//
// The last one is the tell: `text-muted-foreground` is what a different design system calls
// this colour. It is the kind of thing that arrives with a pasted snippet and survives review
// because it reads perfectly. Only the compiler disagrees.
//
// HOW IT WORKS. Pull design-system-shaped class tokens out of string literals, run the real
// `globals.css` through the real Tailwind compiler, and assert each one emits a rule.
//
// DELIBERATELY NARROW. Only prefixes this design system owns, and only bare tokens: no
// arbitrary values, no variants, no dynamic `${}` fragments. A broad scan drowns in English
// words that happen to sit in string literals ("texture", "pressure", "textarea"), and a
// noisy gate gets ignored. Better to catch a real subset every run than a superset once.

import { compile } from 'tailwindcss'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// `lib` is in scope because design-system class strings live there too: lib/gamification.ts
// exports TIER_CONFIG/DIFFICULTY_CONFIG, whose class strings propagate into every achievement
// surface. Those were outside this gate entirely until 2026-08-05, so the green tick was not
// evidence about them — the exact blind spot the DAWN pass then moved real tokens into.
const ROOTS = ['app', 'components', 'lib']
/** Non-triviality floor on the CANDIDATE count (ADR-962). The self-check further down proves the
 *  compiler half works; nothing proved the EXTRACTOR half had looked. A regex that stopped
 *  matching, a wrong cwd or a root that moved would each leave only the DECLARED list, and the
 *  ✓ would read "19 classes checked" with the same confidence as "270". ~70% of the 2026-09-04
 *  reading (270). Lower it only beside a real deletion, and name it — never to go green. */
const MIN_CANDIDATES = 190
/** Prefixes whose vocabulary is OURS — a miss here is a real token that does not exist.
 *  `ring` joined the list when tier glows moved onto ring utilities. */
const OWNED = /^(?:bg|text|border|rounded|tracking|leading|shadow|lift|ring)-[a-z][a-z0-9-]*$/
/** Tailwind's alpha modifier. `bg-rank-clay/10` is the SAME token as `bg-rank-clay` plus an
 *  opacity, so strip it before testing — otherwise every tinted class silently leaves scope,
 *  and tints are exactly how a token-bound palette gets used. */
const stripAlpha = (t) => t.replace(/\/(?:\d{1,3}|\[[^\]]+\])$/, '')
/** English words and legitimate non-class strings that the prefix rule cannot distinguish. */
const IGNORE = new Set([
  'text-only', 'text-bearing', 'text-field', 'text-search', 'text-style', 'text-size',
  'text-color', 'text-font', 'border-box', 'text-align', 'text-content', 'text-block',
  // Prose, not markup: "draws rounded-end bars for connected modules" is a QR test's own
  // description of a bar shape (lib/qr/style.test.ts). Surfaced when `lib` entered scope.
  'rounded-end',
])

/** Classes the design system PROMISES, checked whether or not a call site writes one today.
 *
 *  The scan below is consumer-driven: it can only test a class some file already writes. That
 *  is the right default (it is how a typo gets caught) but it has a blind spot at exactly the
 *  moment a role is born. A role declared in `:root` and never bridged into `@theme inline`
 *  generates NO utility — and with zero consumers there is no string to scan, so this gate
 *  stays green and the first person to reach for the role gets nothing on the page.
 *
 *  So the display/stat roles are asserted directly. Listing one here is the claim "this class
 *  exists"; if the bridge line is missing or the token is renamed, the gate fails on the
 *  DECLARATION rather than waiting for a consumer to discover it. (check:bridge cannot cover
 *  this: it only fires on names Tailwind ALSO defines, and `--text-stat-sm` is ours alone.)
 *
 *  Consumers are still the thing that catches typos — `text-stat-smal` is scanned like any
 *  other string and emits no CSS. The two halves check opposite directions of the same
 *  contract: the source must not write a class the sheet lacks, and the sheet must not lack
 *  a class the design system published. */
const DECLARED = [
  'text-display-hero', 'text-display-h1', 'text-display-h2', 'text-display-h3',
  'text-display-card',
  // ADR-947 — the three roles a sweep proved were missing: a fixed poster/print display size
  // (no `vw`, because print resolves viewport units against the page box), and the two fixed
  // stat steps under the fluid hero `stat` (a price that must not shrink, a KPI that must fit
  // four abreast in a header).
  'text-display-poster',
  'text-stat', 'text-stat-md', 'text-stat-sm',
  // The fluid page title (ADR-947's "fourth decision") — the role that retires a responsive RAMP
  // rather than a literal. Asserted here for the reason this list exists: it is a `clamp()` under
  // a name Tailwind has no default for, so an unbridged declaration emits nothing and reads fine.
  'text-page-title-lg',
  'text-page-title', 'text-lead', 'text-card-title',
  'text-body-lg', 'text-body', 'text-body-sm', 'text-meta', 'text-eyebrow',
]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    // .ts as well as .tsx: a config module that exports class strings is just as load-bearing
    // as a component that writes them inline, and lib/gamification.ts is precisely that.
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

const seen = new Map()
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/["'`]([^"'`\n$]{2,400})["'`]/g)) {
      for (const raw of m[1].split(/\s+/)) {
        const tok = stripAlpha(raw)
        if (!OWNED.test(tok) || IGNORE.has(tok)) continue
        if (!seen.has(tok)) seen.set(tok, `${file}`)
      }
    }
  }
}

const css = readFileSync('app/globals.css', 'utf8')
const compiler = await compile(css, {
  base: process.cwd(),
  loadStylesheet: async (id, base) => {
    const target = id.startsWith('.') ? resolve(base, id) : resolve('node_modules', id)
    const p = target.endsWith('.css') ? target : join(target, 'index.css')
    return { path: p, base: dirname(p), content: readFileSync(p, 'utf8') }
  },
})

for (const c of DECLARED) if (!seen.has(c)) seen.set(c, 'app/globals.css (declared role, no call site yet)')

const candidates = [...seen.keys()].sort()
const out = compiler.build(candidates)

/** Escape EVERY regex metacharacter, backslash included, for embedding in a pattern.
 *  One helper for both call sites: the two had drifted, and the self-check below escaped
 *  only `-` — which CodeQL flagged (js/incomplete-sanitization) and was right to. A hyphen
 *  needs no escape outside a character class; a backslash always does. The inputs here are
 *  class names we scraped, so this is hygiene rather than a live injection, but a half-
 *  escaped pattern in the SELF-CHECK is the worst place for it: a control that silently
 *  fails to match turns the whole gate into a rubber stamp. */
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A rule for class `c` exists in the compiled sheet. */
const emitsCss = (css, c) => new RegExp(`\\.${rx(c)}[\\s,:{]`).test(css)

// SELF-CHECK. A broken extractor and a clean repo produce the same "0 problems", so prove the
// instrument works before trusting its silence: a known-good class must be found emitting CSS.
const control = 'rounded-card'
const controlOk = emitsCss(compiler.build([control]), control)
if (!controlOk) {
  console.error(`✗ Phantom-class gate is BROKEN: the control class \`${control}\` emitted no CSS.`)
  console.error('  The scan cannot be trusted; a green result here would be meaningless.')
  process.exit(1)
}

const phantom = candidates.filter((c) => !emitsCss(out, c))

if (phantom.length > 0) {
  console.error(`✗ Phantom classes: ${phantom.length} class(es) are written but emit NO CSS.\n`)
  for (const c of phantom) console.error(`    ${c.padEnd(30)} ${seen.get(c)}`)
  console.error('\n  Each of these renders nothing. tsc and eslint cannot see it, because a')
  console.error('  className is just a string to them — only the compiler knows the vocabulary.')
  console.error('  Fix by using the real token (see app/globals.css) or, if the token SHOULD')
  console.error('  exist, define it there and bridge it in @theme inline.')
  process.exit(1)
}

// After the phantom report on purpose: a named phantom is the more actionable failure, and the
// sibling test's fixtures are small enough to trip this floor while still proving that arm fires.
if (candidates.length < MIN_CANDIDATES) {
  console.error(`✗ Phantom classes: only ${candidates.length} candidate class(es) extracted, expected at least ${MIN_CANDIDATES}.`)
  console.error('  A ✓ over nothing is the one thing a gate must never print (ADR-962). Either the extractor is')
  console.error(`  broken (wrong cwd, a moved root, a regex that stopped matching) or the tree really shrank and`)
  console.error('  MIN_CANDIDATES needs updating beside that deletion.')
  process.exit(1)
}

console.log(`✓ Phantom classes: ${candidates.length} design-system class(es) checked, every one emits CSS.`)
