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
 *
 * `fix` + `rec` are a RECOMMENDATION, added 2026-08-10 after reading each page against its row.
 * They are not authority: which side is right is a product call about who should have access, and
 * an owner may take the other side on any row. What they remove is the re-derivation — the ladder
 * is `member < crew < host < guide < mentor < admin < janitor`, so `min: 'janitor'` is the
 * NARROWEST setting and `min: 'host'` the widest, which is the opposite of how these rows read at
 * a glance and the reason several of them were mischaracterised when first frozen.
 *
 * The shape of the answer, once each row is read against its page:
 *   · 8 are CATALOG fixes — the page's gate matches the job the page does, and the menu row is
 *     describing a different population than the one the page was built for.
 *   · 3 are PAGE fixes — the page is stricter than the work it holds, so the people whose job it
 *     is cannot reach it. These are the ones worth doing first: each is a tool that currently has
 *     no reachable owner.
 */
export const FROZEN_GATE_DEBT = [
  {
    id: 'connections', catalog: 'janitor+members', page: 'admin+none',
    why: 'menu promises members-domain staff a page that admits the staff web axis only',
    fix: 'catalog', rec: "min: 'admin', drop staffDomain. This row fails BOTH ways at once: members-domain staff see the link and are denied, while a plain admin the page admits never sees it. Connection and friend-request settings is platform configuration, which is what 'admin' with no staff grant already says. Aligning the row removes a dead link without widening access. If members-domain staff genuinely own this, the other side is to add { staff: 'members' } to the page instead.",
  },
  {
    id: 'sms', catalog: 'janitor+members', page: 'janitor+platform',
    why: 'catalog unions members, the page unions platform — two unrelated domains',
    fix: 'catalog', rec: "staffDomain: 'platform'. The ranks already agree; only the domain differs. SMS provisioning status and the operator on/off switch is infrastructure, so the page's domain is the one that matches the subject. The cheapest row on the list.",
  },
  {
    id: 'nonprofit-verifications', catalog: 'janitor+profiles', page: 'janitor+none',
    why: 'profiles-domain staff see the link and are denied',
    fix: 'page', rec: "requireAdmin('janitor', { staff: 'profiles' }). Reviewing 501(c)(3) verification requests is profiles-domain work and the menu already offers it to exactly those people. The page simply never got the staff grant, so today only a janitor can do a job the nav says belongs to the profiles team.",
  },
  {
    id: 'content-tips', catalog: 'host+community', page: 'janitor+none',
    why: 'the widest: offered to every host+ leader and community staffer, admits janitor only',
    fix: 'page', rec: "requireAdmin('host', { staff: 'community' }). The largest population gap on the list, and the most visible: every host, guide, mentor and community staffer is shown a link that lands them on /feed. Tips and prompts for content creators is content work, and janitor-only reads as a copy-pasted default rather than an intent. Highest priority of the eleven.",
  },
  {
    id: 'beta-command', catalog: 'host+marketing', page: 'admin+marketing',
    why: 'catalog uses the community ladder, the page uses the staff axis',
    fix: 'catalog', rec: "min: 'admin'. The domains agree; the catalog is two rungs wider on the ladder. This is the launch phase plan and the approval queue where nothing sends without a sign-off, so the page's stricter rank is the defensible one. Tighten the menu; do not lower the page.",
  },
  {
    id: 'marketing-control-panel', catalog: 'host+marketing', page: 'admin+marketing',
    why: 'same axis mismatch as beta-command',
    fix: 'catalog', rec: "min: 'admin'. Same shape as beta-command and same call: the page shows every campaign email and broadcast per recipient, including where it landed, which is per-person delivery data rather than a leader-level view. Match the page.",
  },
  {
    id: 'crm-pipeline', catalog: 'host+marketing', page: 'janitor+none',
    why: 'promised to hosts and marketing staff, admits janitor only',
    fix: 'page', rec: "requireAdmin('host', { staff: 'marketing' }). The pipeline is marketing's daily surface and the catalog already says so. As it stands the marketing team cannot open their own pipeline unless they happen to be a janitor.",
  },
  {
    id: 'crm-marketing', catalog: 'janitor+marketing', page: 'admin+marketing',
    why: 'page is MORE permissive than the catalog states',
    fix: 'catalog', rec: "min: 'admin'. The one row where the URL is wider than the menu: the page admits any admin, the row shows it to janitors only. It sits in the same console as crm-pipeline and serves the same marketing team, so match the page rather than tightening it and stranding the tool again.",
  },
  {
    id: 'page-layout', catalog: 'janitor+none', page: 'admin+none',
    why: 'menu hides it from a plain admin the URL admits',
    fix: 'catalog', rec: "min: 'admin'. A pure hidden-tool row, no domain involved: the page admits admins, the menu shows janitors only. Nothing about a layout editor argues for the top rung, and the page has already made that call.",
  },
  {
    id: 'business-seeder', catalog: 'janitor+none', page: 'admin+structure',
    why: 'no staffDomain, so nav-areas grants nothing: structure-write staff can use it but never see it',
    fix: 'catalog', rec: "min: 'admin', staffDomain: 'structure'. The row omits the domain entirely, and lib/nav-areas.ts reads an unset staffDomain as 'nobody' rather than 'everybody' — so the structure team, who hold write on exactly this, are the one group that cannot find it. This is the row that motivated the whole gate.",
  },
  {
    id: 'listing-seeder', catalog: 'janitor+none', page: 'admin+structure',
    why: 'same as business-seeder',
    fix: 'catalog', rec: 'Same as business-seeder, and worth doing in the same commit: identical rows, identical pages, identical fix.',
  },
]

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

/** Does the page behind an href read `searchParams` at all? */
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

if (import.meta.url === `file://${process.argv[1]}`) {
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
