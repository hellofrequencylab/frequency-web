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
// about who should have access. The eleven it was born with were frozen until an owner made that
// call; the owner did (ADR-1746) and the list is empty. What it refuses is any new disagreement.
//
// ROWS WITH A QUERY STRING (`/admin/vera-ai?tab=studio`) are deliberately out of scope. Those are
// tabs on one shared page whose gating happens per-tab inside the page body, not in a second
// `requireAdmin`, so there is no page-level call to compare against. Comparing them would produce
// four permanent false positives.

import { readFileSync, existsSync } from 'node:fs'
import { invokedDirectly } from './lib/invoked-directly.mjs'

const CATALOG = 'lib/nav/studio.ts'

/**
 * EMPTY, and that is the finished state rather than an unstarted one.
 *
 * Frozen 2026-08-10 with 11 rows, each a menu row that disagreed with its page. One
 * (`beta-command`) lost its catalog row when the Beta Command Center retired on 2026-08-19. The
 * owner ruled the other ten on 2026-10-14 (ADR-1746): fix the CATALOG side of every row, so each
 * StudioLeaf now states the gate its page's requireAdmin runs. That took the list from 11 to 0,
 * and with it the per-item `gate` override ADR-1745 used in ADMIN_NAV_SPECS. A row that disagrees
 * from here on is a NEW disagreement and fails the build; it never earns a place on this list.
 *
 * Shape kept for the test seam (`io.frozenGate`): { id, catalog, page, why, fix, rec }.
 */
export const FROZEN_GATE_DEBT = []

/* ── Rule 2: a `?tab=` row must point at a page that READS the tab ──────────────────────────────
 *
 * The rule above skips query-string rows, correctly: their authz happens per-tab inside a shared
 * page body, so there is no page-level `requireAdmin` to compare against. But "out of scope for
 * the authz comparison" quietly became "unchecked", and a different disagreement moved in.
 *
 * A row promising `/admin/programs?tab=content` lands on `/admin/programs`. If that page takes no
 * `searchParams`, the query string is inert and the row renders the parent dashboard under a
 * child's name. Two rows pointing at two tabs of a page with no tabs are two menu entries that
 * open the same screen, and the operator has no way to tell that from a bug.
 *
 * Measured 2026-08-10: 4 of 8 tab rows point at a page that reads no searchParams. Both targets
 * say so in their own header comments — `/admin/programs` is "a single DASHBOARD (no sub-tabs)".
 * So the pages are behaving as designed and the CATALOG is the side that is wrong; which of the
 * two fixes to take (teach the pages tabs, re-point the rows, or drop them) is a nav decision for
 * an owner. Frozen with their numbers until then. What this refuses is a NINTH.
 */
/** EMPTY, and that is the finished state rather than an unstarted one.
 *
 *  This list held four rows for about an hour: programs?tab=content, programs?tab=rewards,
 *  growth?tab=acquisition, growth?tab=marketing. The owner's call (2026-08-10) was to drop the
 *  four synthetic menu rows rather than teach two dashboards a tab strip they had each
 *  deliberately declined. The `content` and `rewards` areas survive with their real leaves; only
 *  their own landing href lost an inert query string.
 *
 *  Every remaining `?tab=` row points at /admin/vera-ai, which does read searchParams. So the rule
 *  now guards a clean corpus, which is the only state in which a frozen list should be empty. */
export const FROZEN_TAB_DEBT = []

/** Every catalog href carrying a `?tab=`, including the `synthetic:` rows that have no `id`. */
export function tabRows(src) {
  const out = new Set()
  for (const m of src.matchAll(/href:\s*'(\/admin\/[^']*\?tab=[^']*)'/g)) out.add(m[1])
  return [...out].sort()
}

/** Does the page behind an href read `searchParams` at all?
 *  @param {string} href
 *  @param {(f: string) => string} [read] repo-relative reader (the default hits the filesystem)
 *  @param {(f: string) => boolean} [exists] repo-relative probe */
export function pageReadsSearchParams(href, read = (f) => readFileSync(f, 'utf8'), exists = existsSync) {
  const path = href.split('?')[0].replace(/^\//, '')
  const file = [`app/(main)/${path}/page.tsx`, `app/${path}/page.tsx`].find((p) => exists(p))
  if (!file) return { file: null, missing: true, reads: false }
  return { file, missing: false, reads: /searchParams/.test(read(file)) }
}

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

/** The page-level `requireAdmin(min, { staff })` a route actually runs, or null when it has none.
 *  @param {string} href
 *  @param {(f: string) => string} [read] repo-relative reader (the default hits the filesystem)
 *  @param {(f: string) => boolean} [exists] repo-relative probe */
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

/** Same reasoning for rule 2's corpus, with one lesson attached. This was 6, calibrated against
 *  the 8 tab rows that existed when the rule was written. Dropping the four inert rows took the
 *  corpus to 4 and the floor fired — correctly noticing the corpus had shrunk, on a shrink that
 *  was the whole point of the change. A floor is calibrated to a corpus, so fixing the corpus is
 *  a reason to re-calibrate it, not to remove it. Now 3, under the 4 live vera-ai rows. */
export const MIN_TAB_ROWS = 3

export function evaluate(src, io = {}) {
  const rows = catalogRows(src)
  if (rows.length < MIN_ROWS) {
    throw new Error(
      `check:gate-parity parsed only ${rows.length} catalog row(s), expected at least ${MIN_ROWS}. ` +
        'The parser is broken or lib/nav/studio.ts changed shape. A gate that scans nothing passes ' +
        'everything, so this is a failure rather than a clean run.',
    )
  }
  // `io.frozenGate` is a TEST SEAM, the twin of `io.frozenTabs` below: FROZEN_GATE_DEBT is empty, so
  // the healed and drifted branches are unreachable against the real catalog, and the override lets a
  // test seed a frozen row and prove both branches still fire.
  const frozen = new Map((io.frozenGate ?? FROZEN_GATE_DEBT).map((d) => [d.id, d]))
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
  // Rule 2: tab rows whose page cannot read a tab.
  // `io.frozenTabs` is a TEST SEAM. FROZEN_TAB_DEBT is empty now that the four inert rows are
  // gone, which leaves the healed-detection branch unreachable against the real catalog — and an
  // unreachable branch is an untested one. The override lets a test seed a frozen href and prove
  // the branch still fires, rather than deleting the coverage along with the debt.
  const frozenTabs = new Set(io.frozenTabs ?? FROZEN_TAB_DEBT.map((d) => d.href))
  const tabs = tabRows(src)
  if (tabs.length < MIN_TAB_ROWS) {
    throw new Error(
      `check:gate-parity parsed only ${tabs.length} '?tab=' row(s), expected at least ` +
        `${MIN_TAB_ROWS}. The parser is broken; a rule that scans nothing passes everything.`,
    )
  }
  const inertTabs = []
  const healedTabs = []
  for (const href of tabs) {
    const p = pageReadsSearchParams(href, io.read, io.exists)
    if (p.missing) continue // a dangling href is check:menu's job
    if (p.reads) {
      if (frozenTabs.has(href)) healedTabs.push({ href, file: p.file })
      continue
    }
    if (!frozenTabs.has(href)) inertTabs.push({ href, file: p.file })
  }

  return { rows: rows.length, compared, fresh, drifted, healed, tabs: tabs.length, inertTabs, healedTabs }
}

if (invokedDirectly(import.meta.url)) {
  const src = readFileSync(CATALOG, 'utf8')
  const { rows, compared, fresh, drifted, healed, tabs, inertTabs, healedTabs } = evaluate(src)
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

  if (inertTabs.length > 0) {
    bad = true
    console.error(`\n✗ ${inertTabs.length} '?tab=' menu row(s) point at a page that reads no searchParams:\n`)
    for (const t of inertTabs) console.error(`    ${t.href}\n      ${t.file} takes no searchParams, so the tab is inert`)
    console.error(
      '\n  The row renders the parent page under a child\'s name, which the operator cannot tell\n' +
        '  from a bug. Either teach the page to read the tab (see admin/vera-ai/page.tsx) or point\n' +
        '  the row somewhere real. Do NOT add it to FROZEN_TAB_DEBT — that list is a record of what\n' +
        '  predates the rule.\n',
    )
  }

  if (healedTabs.length > 0) {
    console.log(`\n✅ ${healedTabs.length} frozen tab row(s) now resolve — delete them from FROZEN_TAB_DEBT:`)
    for (const t of healedTabs) console.log(`    ${t.href}`)
    console.log('')
  }

  if (bad) process.exit(1)
  console.log(
    `✓ Gate parity: ${compared} of ${rows} catalog row(s) compared against their page guard; ` +
      `no new disagreement (${FROZEN_GATE_DEBT.length} frozen, see FROZEN_GATE_DEBT).\n` +
      `  ${tabs} '?tab=' row(s) checked against their page's searchParams; ` +
      `no new inert tab (${FROZEN_TAB_DEBT.length} frozen, see FROZEN_TAB_DEBT).`,
  )
}
