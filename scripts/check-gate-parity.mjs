#!/usr/bin/env node
// check:gate-parity — the menu catalog and the page it points at must agree about WHO GETS IN.
//
// WHY THIS EXISTS. `check:menu` already enforces that every menu item comes from one catalog, and
// it is strict about it. But it validates the catalog's SHAPE — it has no way to reach inside a
// page body and read the `requireAdmin()` that actually runs. So a row can promise Growth-domain
// hosts a tool whose page admits janitors only, and every gate in the repo stays green while the
// menu lies to eleven populations at once.
//
// Measured 2026-08-10: 11 of 68 rows disagreed with their page. They fail in two directions, and
// the directions are not symmetric:
//
//   · MENU PROMISES, PAGE DENIES — a dead menu item. The user clicks and lands on /feed. This is
//     the worse one: it is indistinguishable from a bug, and it trains people to distrust the nav.
//   · PAGE ALLOWS, MENU HIDES — a working tool its authorized users can never find. Quieter, and
//     the reason `business-seeder` sat unreachable for structure-domain staff: `lib/nav-areas.ts`
//     returns false when `staffDomain` is unset, so "no domain" reads as "nobody".
//
// WHAT THIS GATE DOES NOT DO. It does not decide which side is right — that is a product call
// about who should have access, and the eleven below are frozen with their numbers until an owner
// makes it. What it refuses is a TWELFTH: a new row that disagrees with its page fails CI.
//
// ROWS WITH A QUERY STRING (`/admin/vera-ai?tab=studio`) are deliberately out of scope. Those are
// tabs on one shared page whose gating happens per-tab inside the page body, not in a second
// `requireAdmin`, so there is no page-level call to compare against. Comparing them would produce
// four permanent false positives.

import { readFileSync, existsSync } from 'node:fs'

const CATALOG = 'lib/nav/studio.ts'

/**
 * The 11 known disagreements, frozen 2026-08-10 with the values measured that day.
 * A row leaves this list by being FIXED (either side), not by being edited here.
 * `catalog` / `page` are recorded so a drift in either direction is visible in the diff.
 */
export const FROZEN_GATE_DEBT = [
  { id: 'connections', catalog: 'janitor+members', page: 'admin+none', why: 'menu promises members-domain staff a page that admits the staff web axis only' },
  { id: 'sms', catalog: 'janitor+members', page: 'janitor+platform', why: 'catalog unions members, the page unions platform — two unrelated domains' },
  { id: 'nonprofit-verifications', catalog: 'janitor+profiles', page: 'janitor+none', why: 'profiles-domain staff see the link and are denied' },
  { id: 'content-tips', catalog: 'host+community', page: 'janitor+none', why: 'the widest: offered to every host+ leader and community staffer, admits janitor only' },
  { id: 'beta-command', catalog: 'host+marketing', page: 'admin+marketing', why: 'catalog uses the community ladder, the page uses the staff axis' },
  { id: 'marketing-control-panel', catalog: 'host+marketing', page: 'admin+marketing', why: 'same axis mismatch as beta-command' },
  { id: 'crm-pipeline', catalog: 'host+marketing', page: 'janitor+none', why: 'promised to hosts and marketing staff, admits janitor only' },
  { id: 'crm-marketing', catalog: 'janitor+marketing', page: 'admin+marketing', why: 'page is MORE permissive than the catalog states' },
  { id: 'page-layout', catalog: 'janitor+none', page: 'admin+none', why: 'menu hides it from a plain admin the URL admits' },
  { id: 'business-seeder', catalog: 'janitor+none', page: 'admin+structure', why: 'no staffDomain, so nav-areas grants nothing: structure-write staff can use it but never see it' },
  { id: 'listing-seeder', catalog: 'janitor+none', page: 'admin+structure', why: 'same as business-seeder' },
]

/** Catalog rows carrying an `/admin/...` href, with the gate they declare. */
export function catalogRows(src) {
  const rows = []
  for (const m of src.matchAll(/\{\s*id:\s*'([^']+)',[^}]*?href:\s*'(\/admin\/[^']*)'[^}]*?\}/gs)) {
    const body = m[0]
    // Rows nest (`adminGroups: [{ domain: … }]`), so `[^}]` stops at the FIRST inner brace and a
    // greedy alternative would swallow the next row whole. The length guard keeps a match to one
    // row; anything longer means the regex ran past its row and the match is not trustworthy.
    if (body.length > 1200) continue
    // A `?tab=`/`#` href is a tab on a shared page — gated in the page body, not by a second call.
    if (/[?#]/.test(m[2])) continue
    rows.push({
      id: m[1],
      href: m[2],
      min: /\bmin:\s*'([^']+)'/.exec(body)?.[1] ?? null,
      domain: /\bstaffDomain:\s*'([^']+)'/.exec(body)?.[1] ?? null,
    })
  }
  return rows
}

/** The page-level `requireAdmin(min, { staff })` a route actually runs, or null when it has none. */
export function pageGate(href, read = (f) => readFileSync(f, 'utf8'), exists = existsSync) {
  const rel = href.replace(/^\//, '')
  const file = [`app/(main)/${rel}/page.tsx`, `app/${rel}/page.tsx`].find((p) => exists(p))
  if (!file) return { file: null, min: null, domain: null, missing: true }
  const code = read(file)
  const call = /requireAdmin\(\s*'([^']*)'\s*(?:,\s*\{([^}]*)\})?/.exec(code)
  if (!call) return { file, min: null, domain: null, missing: false, noCall: true }
  return {
    file,
    min: call[1],
    domain: call[2] ? (/staff:\s*'([^']+)'/.exec(call[2])?.[1] ?? null) : null,
    missing: false,
  }
}

const fmt = (min, domain) => `${min ?? '-'}+${domain ?? 'none'}`

/** A gate that scans nothing reports a clean bill of health. This floor is what stops that:
 *  the catalog has had 60+ /admin rows for months, so a sudden collapse to a handful means the
 *  parser broke, not that the menu shrank. Found the hard way — the first version of this file
 *  printed "0 of 0 ✓" and exited 0. */
export const MIN_ROWS = 40

export function evaluate(src, io = {}) {
  const rows = catalogRows(src)
  if (rows.length < MIN_ROWS) {
    throw new Error(
      `check:gate-parity parsed only ${rows.length} catalog row(s), expected at least ${MIN_ROWS}. ` +
        'The parser is broken or lib/nav/studio.ts changed shape. A gate that scans nothing passes ' +
        'everything, so this is a failure rather than a clean run.',
    )
  }
  const frozen = new Map(FROZEN_GATE_DEBT.map((d) => [d.id, d]))
  const fresh = []
  const drifted = []
  const healed = []
  let compared = 0

  for (const r of rows) {
    const g = pageGate(r.href, io.read, io.exists)
    if (g.missing || g.noCall) continue // dangling hrefs and un-gated pages are other gates' jobs
    compared++
    const cat = fmt(r.min, r.domain)
    const pag = fmt(g.min, g.domain)
    const agrees = cat === pag
    const known = frozen.get(r.id)
    if (agrees) {
      if (known) healed.push({ ...r, was: `${known.catalog} vs ${known.page}` })
      continue
    }
    if (!known) { fresh.push({ ...r, cat, pag, file: g.file }); continue }
    if (known.catalog !== cat || known.page !== pag) {
      drifted.push({ ...r, cat, pag, was: `${known.catalog} vs ${known.page}`, file: g.file })
    }
  }
  return { rows: rows.length, compared, fresh, drifted, healed }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const src = readFileSync(CATALOG, 'utf8')
  const { rows, compared, fresh, drifted, healed } = evaluate(src)
  let bad = false

  if (fresh.length > 0) {
    bad = true
    console.error(`\n✗ ${fresh.length} NEW menu/page gate disagreement(s):\n`)
    for (const f of fresh) {
      console.error(`    ${f.id}  (${f.href})`)
      console.error(`      catalog says ${f.cat}, ${f.file} runs ${f.pag}`)
    }
    console.error(
      '\n  The menu and the page must agree about who gets in. Fix whichever side is wrong —\n' +
        '  do NOT add a row to FROZEN_GATE_DEBT to silence this. That list is a record of debt\n' +
        '  that predates the gate, not a waiver mechanism.\n',
    )
  }

  if (drifted.length > 0) {
    bad = true
    console.error(`\n✗ ${drifted.length} frozen row(s) CHANGED without leaving the list:\n`)
    for (const d of drifted) console.error(`    ${d.id}: was ${d.was}, now ${d.cat} vs ${d.pag}`)
    console.error('\n  Either finish the fix (both sides agree) or update the frozen entry with why.\n')
  }

  if (healed.length > 0) {
    console.log(`\n✅ ${healed.length} frozen row(s) now AGREE — delete them from FROZEN_GATE_DEBT:`)
    for (const h of healed) console.log(`    ${h.id} (was ${h.was})`)
    console.log('')
  }

  if (bad) process.exit(1)
  console.log(
    `✓ Gate parity: ${compared} of ${rows} catalog row(s) compared against their page guard; ` +
      `no new disagreement (${FROZEN_GATE_DEBT.length} frozen, see FROZEN_GATE_DEBT).`,
  )
}
