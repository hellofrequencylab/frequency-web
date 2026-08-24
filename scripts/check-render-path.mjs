#!/usr/bin/env node
// ONE RENDER PATH — a gated marketing page renders its Puck document, and the coded body it
// still carries alongside may only shrink.
//
// WHY THIS EXISTS. `EDITABLE_PAGES` (lib/page-editor/data.ts) declares the slugs an operator can
// edit in the page editor. Each of those routes resolves published → template → a bespoke coded
// body, so the same page exists twice: once as blocks an operator can rearrange, once as ~3,000
// lines of TSX only a developer can change. The redesign left the CODED side ahead of the
// templates, inverting the drift the three-rung chain was built to survive. Two sources of truth
// is a standing invitation for a third (docs/FINALIZE-PLAN.md §Phase 5).
//
// Retiring those bodies is gated on the visual suite proving each template equivalent, one slug
// per PR. This gate is what holds the line in the meantime.
//
// WHAT IT ENFORCES:
//
//   1. THE RENDER PATH EXISTS. Every `EDITABLE_PAGES` slug resolves to a route file that actually
//      renders `<BlockRender>`. A slug added to the editor with no render path is a page the
//      operator can "edit" with no effect — the editor saves, the site ignores it. This is a
//      truth check with no baseline: it passes or the page is lying to its operator.
//
//   2. THE CODED BODY MAY ONLY SHRINK. `scripts/render-path-bodies.txt` records, per slug, how
//      many coded React components the route file still declares beside its default export. The
//      measured count must MATCH the ledger:
//        · MORE  -> new duplicate truth on a page already queued for retirement. Refused.
//        · FEWER -> a body retired. Also refused, because the ledger IS the scoreboard for
//                   Phase 5 and a scoreboard nobody updates is a scoreboard nobody reads. The
//                   fix is one number, in the same PR that earned it.
//
// WHY COMPONENTS AND NOT LINES. Line count is the number the plan quotes, and it is the wrong
// thing to gate on: every copy edit moves it, so the gate would fail for reasons that have
// nothing to do with the duality, and a gate that cries wolf earns an allowlist. A top-level
// `function <Capitalized>` is a structural fact — it changes when the page's SHAPE changes, which
// is exactly the event this is watching for. Lines are printed as context, never checked.
//
// WHAT IT CANNOT SEE, so green here is not "the templates are equivalent":
//   · Whether the published template renders the same PAGE. Only the visual suite can say that,
//     and it is the gate on actually deleting a body (FINALIZE-PLAN §5.2).
//   · A coded body that moved OUT of the route file into a sibling component. The count would
//     fall and this gate would ask you to record a win you did not earn. The ledger comment is
//     where that has to be written down.
//   · Anything about non-gated marketing routes. They have no editor rung, so no duality.
//
// ⚠️ WHERE THIS RUNS (changed 2026-08-12). No longer a `check:*` entry in the CI guards array: it is
// enforced by scripts/check-render-path.test.ts, which vitest AUTO-DISCOVERS, so it cannot be
// forgotten in an array the way check:studio was for the whole life of PR #2098. The rules live in
// the exported `runCheck()`, which returns its findings as DATA, so the CLI and the test enforce the
// same thing with no second copy. Still runnable by hand for the friendly report:
// `node scripts/check-render-path.mjs`. Exits 1 on violation.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const LEDGER = join('scripts', 'render-path-bodies.txt')
const DATA = join('lib', 'page-editor', 'data.ts')

/** Where each gated slug's route lives. Not derivable from `path`: `/` is `app/page.tsx`, and
 *  `/circles` is a (main) route, not a (marketing) one. */
const ROUTES = {
  home: 'app/page.tsx',
  about: 'app/(marketing)/about/page.tsx',
  spaces: 'app/(marketing)/spaces/page.tsx',
  'the-lab': 'app/(marketing)/the-lab/page.tsx',
  'the-community': 'app/(marketing)/the-community/page.tsx',
  'the-quest': 'app/(marketing)/the-quest/page.tsx',
  pricing: 'app/(marketing)/pricing/page.tsx',
  circles: 'app/(main)/circles/page.tsx',
  'how-to-start-a-circle': 'app/(marketing)/how-to-start-a-circle/page.tsx',
  'how-to-build-community': 'app/(marketing)/how-to-build-community/page.tsx',
  loneliness: 'app/(marketing)/loneliness/page.tsx',
  'friendship-as-an-adult': 'app/(marketing)/friendship-as-an-adult/page.tsx',
  'calm-down-fast': 'app/(marketing)/calm-down-fast/page.tsx',
  'how-to-be-more-social': 'app/(marketing)/how-to-be-more-social/page.tsx',
  'tools-for-community-builders': 'app/(marketing)/tools-for-community-builders/page.tsx',
  'what-is-frequency': 'app/(marketing)/what-is-frequency/page.tsx',
}

/** Blank both comment forms, length-preserving (same reason as check-grants.mjs / check-labels.mjs:
 *  a component named inside a comment is not a component). */
export function stripComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)))
}

/** The gated slugs, parsed from EDITABLE_PAGES rather than hardcoded, so adding one there is what
 *  brings it under this gate. */
export function gatedSlugs(dataSrc) {
  const block = /export const EDITABLE_PAGES = \[([\s\S]*?)\] as const/.exec(stripComments(dataSrc))
  if (!block) return []
  return [...block[1].matchAll(/slug:\s*'([a-z0-9-]+)'/g)].map((m) => m[1])
}

/** Top-level React components declared in a route file, beside the default export. */
export function codedComponents(src) {
  const code = stripComments(src)
  return [...code.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)/gm)]
    .map((m) => m[1])
    .filter((name) => !/Page$/.test(name))
}

export function rendersBlocks(src) {
  return /<BlockRender\b/.test(stripComments(src))
}

/** Parse `slug<whitespace>count`; `#` comments and blank lines ignored. */
export function parseLedger(text) {
  const entries = new Map()
  const bad = []
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) return
    const [slug, count] = line.split(/\s+/)
    if (!slug || !/^\d+$/.test(count ?? '')) {
      bad.push(`${LEDGER}:${i + 1}  "${raw.trim()}"`)
      return
    }
    entries.set(slug, { count: Number(count), line: i + 1 })
  })
  return { entries, bad }
}

/** THE NON-TRIVIALITY FLOOR. `gatedSlugs()` returns [] the moment its regex stops matching
 *  EDITABLE_PAGES, and an empty slug list means an empty loop, no failures, and a green gate that
 *  checked nothing. 8 slugs are gated today; 5 leaves room for a page leaving the editor while
 *  still firing on a parser that has given up. Fix the parser; never lower this. */
export const MIN_SLUGS = 5

/** Every check, as DATA rather than as console output — so scripts/check-render-path.test.ts
 *  enforces exactly what the CLI reports, with no second copy of the rules to drift.
 *  Returns { problems: string[], rows, slugs }. `problems` non-empty ⇒ the gate fails. */
export function runCheck() {
  if (!existsSync(LEDGER) || !existsSync(DATA)) {
    return {
      problems: [
        `✗ check:render-path — missing ${!existsSync(LEDGER) ? LEDGER : DATA} (cwd: ${process.cwd()}).\n` +
          '    Run from the repo root. A gate cannot pass over nothing.',
      ],
      rows: [],
      slugs: [],
    }
  }

  const slugs = gatedSlugs(readFileSync(DATA, 'utf8'))
  if (slugs.length < MIN_SLUGS) {
    return {
      problems: [
        `✗ check:render-path — parsed ${slugs.length} slug(s) from EDITABLE_PAGES, expected at least ${MIN_SLUGS}.\n` +
          `    The parser has stopped matching ${DATA}. Fix it; do not lower the floor.`,
      ],
      rows: [],
      slugs,
    }
  }

  const { entries, bad } = parseLedger(readFileSync(LEDGER, 'utf8'))
  const problems = []

  for (const line of bad) {
    problems.push(`✗ check:render-path — unparseable ledger line.\n\n  ${line}\n\n    Expected: <slug>  <coded-component-count>`)
  }

  for (const [slug, { line }] of entries) {
    if (slugs.includes(slug)) continue
    problems.push(
      `✗ check:render-path — stale ledger entry \`${slug}\` (${LEDGER}:${line}).\n` +
        `    It is no longer in EDITABLE_PAGES (${DATA}). Delete the line.`,
    )
  }

  const rows = []
  for (const slug of slugs) {
    const route = ROUTES[slug]
    if (!route || !existsSync(route)) {
      problems.push(
        `✗ check:render-path — no route mapped for gated slug \`${slug}\`.\n` +
          `    Add it to ROUTES in scripts/check-render-path.mjs.`,
      )
      continue
    }
    const src = readFileSync(route, 'utf8')

    if (!rendersBlocks(src)) {
      problems.push(
        `✗ check:render-path — \`${slug}\` is editable but ${route} never renders <BlockRender>.\n` +
          '    An operator can edit this page in the editor and the site will ignore it:\n' +
          '    the document saves and publishes, and no visitor ever sees it. Either render\n' +
          `    the published document, or remove the slug from EDITABLE_PAGES in ${DATA}.`,
      )
    }

    const comps = codedComponents(src)
    const lines = src.split('\n').length
    const entry = entries.get(slug)
    rows.push({ slug, route, comps: comps.length, lines })

    if (!entry) {
      problems.push(
        `✗ check:render-path — no ledger row for gated slug \`${slug}\`.\n` +
          `    ${route} declares ${comps.length} coded component(s). Add one line to ${LEDGER}:\n\n` +
          `      ${slug}  ${comps.length}`,
      )
      continue
    }

    if (comps.length > entry.count) {
      const added = comps.slice(entry.count).join(', ')
      problems.push(
        `✗ check:render-path — \`${slug}\` grew a coded body: ${entry.count} -> ${comps.length} component(s).\n` +
          `    ${route} (${lines} lines). New: ${added || '(reordered)'}\n` +
          '    This page already exists twice, as blocks an operator can rearrange and as TSX\n' +
          '    only a developer can change, and it is queued for retirement (FINALIZE-PLAN §5.2).\n' +
          '    Put new marketing structure in a BLOCK, not in the route file.',
      )
    } else if (comps.length < entry.count) {
      problems.push(
        `✗ check:render-path — \`${slug}\` shrank: ${entry.count} -> ${comps.length} component(s). Record it.\n` +
          `    ${LEDGER}:${entry.line} still says ${entry.count}. Change it to ${comps.length}.\n` +
          '    This ledger is the Phase 5 scoreboard; a scoreboard nobody updates is one\n' +
          '    nobody reads. If the body MOVED to a sibling file rather than retiring, say so\n' +
          '    in a comment on that line — the count cannot tell the difference.',
      )
    }
  }

  return { problems, rows, slugs }
}

function main() {
  const { problems, rows } = runCheck()

  if (problems.length > 0) {
    for (const p of problems) console.error(`${p}\n`)
    console.error(`✖ One render path: ${problems.length} problem(s). See docs/FINALIZE-PLAN.md §Phase 5.`)
    process.exit(1)
  }

  const totalComps = rows.reduce((n, r) => n + r.comps, 0)
  const totalLines = rows.reduce((n, r) => n + r.lines, 0)
  const clean = rows.filter((r) => r.comps === 0).length
  console.log(
    `✓ One render path: ${rows.length} gated slug(s), every one rendering <BlockRender>; ` +
      `${clean} on the template alone, ${rows.length - clean} still carrying a coded body ` +
      `(${totalComps} component(s), ${totalLines} lines of route file).`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('check-render-path.mjs')) main()
