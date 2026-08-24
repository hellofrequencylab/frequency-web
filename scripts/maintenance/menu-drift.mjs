#!/usr/bin/env node
// menu-drift — the PUBLIC `header` menu the database serves, against the code defaults it was
// seeded from.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
// The header a visitor reads is DB rows (public.menus + menu_items), not the code registry.
// The two are joined by one inserts-only sync (lib/menus/actions.ts::syncMenuFromDefaults):
// it adds a default page that is absent AND not in `synced_default_keys`, it never deletes, and
// it never resurrects. That is the right policy — an operator's delete has to stick — but it
// means the DB can silently stop matching the code and NOTHING says so.
//
// On 2026-08-24 it had, in three ways at once, and only one of them was even visible:
//   • `/spaces/directory` had been synced then removed, so it sat in `synced_default_keys` and
//     the engine could never bring it back. The Spaces directory had no path from the header.
//   • A row labelled "Spaces directory" pointed at `/spaces`, the marketing page. A visitor
//     following the obvious label reached the wrong destination. NO count-based check can see
//     this: the item is present, the href is a real page, the totals agree.
//   • Five hrefs in the baseline (`/for/coaches`, `/for/product-businesses`,
//     `/for/service-businesses`, `/classifieds`, `/market`) name defaults that no longer exist.
//
// So this reports FOUR findings, and the MISLABEL is the one worth the file: a DB row whose
// LABEL matches a code default but whose HREF does not is a link that says one thing and lands
// somewhere else. That is a member-facing defect, and it is invisible to every gate the repo had.
//
// ── WHERE IT RUNS, AND WHY NOT IN CI ────────────────────────────────────────────────────────
// The scheduled maintenance sweep (.github/workflows/maintenance.yml), on the ledger-parity
// pattern exactly: a token-gated shell step performs the read and feeds this script the JSON, so
// the script itself never touches a database and is testable without one. It does NOT belong in
// the ci.yml guard array — CI has no database credentials, so it could only pass vacuously, and a
// gate that cannot fire honestly is a gate people route around (ADR-970).
//
// It is READ-ONLY. Every finding names the repair; none of them is applied here.
//
// ⚠️ SCOPED TO `header` ON PURPOSE. docs/BUILD-BACKLOG.json HYG-010 asked for this check against
// `admin_header`, and `admin_header` has ZERO DB rows — that check would have guarded an empty
// set forever and read as coverage. `header` is the surface that was actually drifting.
//
// Usage:
//   node scripts/maintenance/menu-drift.mjs --print-query   # emit the SQL for the fetch step
//   pnpm maintenance:menu-drift <menu.json>                 # compare, report, exit 1 on drift

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const SURFACE = 'header'
const REGISTRY = 'lib/nav/registry.ts'

/**
 * The read. A plain SELECT of the live surface: every leaf row (label + href) and every baseline
 * key, as ONE json payload so the workflow step needs a single request.
 *
 * `space_id is null` pins the GLOBAL header (a Space-scoped menu is a different surface with a
 * different code default and is deliberately out of scope here).
 */
export const MENU_QUERY = `
select json_build_object(
  'items', coalesce((
    select json_agg(json_build_object('label', mi.label, 'href', mi.href) order by mi.position, mi.id)
      from public.menu_items mi where mi.menu_id = m.id
  ), '[]'::json),
  'syncedDefaultKeys', coalesce(m.synced_default_keys, '[]'::jsonb)
) as menu
  from public.menus m
 where m.surface_key = '${SURFACE}' and m.space_id is null
 limit 1;
`.trim()

// ── The CODE side ───────────────────────────────────────────────────────────────────────────
// Read straight out of lib/nav/registry.ts's HEADER_TRIGGER_SEEDS with the TypeScript parser,
// rather than importing lib/menus/defaults.ts. Not a shortcut: defaults.ts reaches through `@/`
// aliases into NAV_AREAS and ADMIN_NAV, so importing it from a plain .mjs means a bundler or a
// loader shim, and this instrument must stay a pure function of two inputs.
//
// The projection MIRRORS defaults.ts::headerMenu — a trigger with sub-links contributes its
// sub-links; a trigger without them contributes its own landing. A drift between that function
// and this reader would show up as spurious findings, which is loud, not silent.

/** The code header as TRIGGERS: `{label, href, items: [{label, href}]}`, in nav order.
 *
 *  Exported alongside `codeLeaves` because two invariants live at the trigger level and vanish once
 *  the tree is flattened: a dropdown must contain its OWN landing (or that page has no path from
 *  the header at all), and no header node may point at a robots-disallowed app-shell twin. The
 *  LIVE-107 backlog probe reads this. */
export function codeTriggers(source) {
  const file = ts.createSourceFile(REGISTRY, source, ts.ScriptTarget.Latest, true)
  let seeds = null
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'HEADER_TRIGGER_SEEDS'
    ) {
      let init = node.initializer
      while (init && (ts.isAsExpression(init) || ts.isParenthesizedExpression(init))) init = init.expression
      if (init && ts.isArrayLiteralExpression(init)) seeds = init
    }
    if (!seeds) ts.forEachChild(node, visit)
  }
  visit(file)
  if (!seeds) throw new Error(`HEADER_TRIGGER_SEEDS not found in ${REGISTRY}`)

  const str = (obj, key) => {
    const p = obj.properties.find(
      (x) => ts.isPropertyAssignment(x) && ts.isIdentifier(x.name) && x.name.text === key,
    )
    return p && ts.isStringLiteralLike(p.initializer) ? p.initializer.text : undefined
  }

  const out = []
  for (const el of seeds.elements) {
    if (!ts.isObjectLiteralExpression(el)) continue
    const label = str(el, 'label')
    const href = str(el, 'href')
    if (!label || !href) continue
    const itemsProp = el.properties.find(
      (x) => ts.isPropertyAssignment(x) && ts.isIdentifier(x.name) && x.name.text === 'items',
    )
    const items = []
    if (itemsProp && ts.isArrayLiteralExpression(itemsProp.initializer)) {
      for (const it of itemsProp.initializer.elements) {
        if (!ts.isObjectLiteralExpression(it)) continue
        const l = str(it, 'label')
        const h = str(it, 'href')
        if (l && h) items.push({ label: l, href: h })
      }
    }
    out.push({ label, href, items })
  }
  if (out.length === 0) throw new Error(`${REGISTRY} yielded no header triggers — reader is broken`)
  return out
}

/** Every leaf {label, href} the code default for `header` would render, in nav order. MIRRORS
 *  defaults.ts::headerMenu: a trigger with sub-links contributes its sub-links, a trigger without
 *  them contributes its own landing. */
export function codeLeaves(source) {
  return codeTriggers(source).flatMap((t) => (t.items.length > 0 ? t.items : [{ label: t.label, href: t.href }]))
}

/** Parse the Supabase query response into {items, syncedDefaultKeys}. */
export function parseMenu(payload) {
  const rows = Array.isArray(payload) ? payload : (payload?.result ?? payload?.rows ?? [])
  const menu = rows[0]?.menu ?? rows[0]
  if (!menu || !Array.isArray(menu.items)) {
    throw new Error('menu payload has no items array — the surface may not be materialized')
  }
  return {
    items: menu.items.map((i) => ({ label: String(i.label ?? ''), href: String(i.href ?? '') })),
    syncedDefaultKeys: (menu.syncedDefaultKeys ?? []).map(String),
  }
}

// ── The comparison ──────────────────────────────────────────────────────────────────────────

/**
 * Compare the code leaves with the live rows. Four findings, in descending severity:
 *
 *   mislabelled  — a DB row whose LABEL matches a code default but whose HREF differs. The link
 *                  says one thing and lands somewhere else. Member-facing; nothing else sees it.
 *   unreachable  — a code default absent from the DB **and** already in `synced_default_keys`, so
 *                  the inserts-only sync will never bring it back. Silent, permanent.
 *   pending      — a code default absent from the DB and NOT in the baseline: the next sync adds
 *                  it. Informational, and the one finding that resolves itself.
 *   staleBaseline— a baseline key naming a default that no longer exists. Harmless to a renderer,
 *                  and it makes every future audit of this table misread.
 *
 * A DB row with no code counterpart is NOT a finding: operators are allowed to add links, and
 * calling that drift would train people to ignore this report.
 */
export function compare(code, live) {
  const byHref = new Map(live.items.map((i) => [i.href, i]))
  const byLabel = new Map()
  for (const i of live.items) if (!byLabel.has(i.label)) byLabel.set(i.label, i)
  const baseline = new Set(live.syncedDefaultKeys)
  const codeHrefs = new Set(code.map((l) => l.href))

  const mislabelled = []
  const unreachable = []
  const pending = []

  for (const leaf of code) {
    // The destination is live: nothing to say, whatever else carries this label.
    if (byHref.has(leaf.href)) continue
    // The destination is NOT live but its label is, on some other href. That row is the defect:
    // it wears the name of a page it does not go to.
    //
    // ⚠️ The `actual` href is deliberately NOT excused for being a real code default elsewhere.
    // The live 2026-08-24 row was exactly that — "Spaces directory" pointing at `/spaces`, which
    // IS the Spaces trigger's own landing — and an earlier draft of this function skipped it for
    // that reason and reported a clean sweep. Whether the wrong destination happens to be a page
    // we also link somewhere else has nothing to do with whether this link lies.
    const sameLabel = byLabel.get(leaf.label)
    if (sameLabel) {
      mislabelled.push({ label: leaf.label, expected: leaf.href, actual: sameLabel.href })
      continue
    }
    ;(baseline.has(leaf.href) ? unreachable : pending).push(leaf)
  }

  const staleBaseline = live.syncedDefaultKeys.filter((k) => !codeHrefs.has(k))

  // ⚠️ `ok` deliberately IGNORES staleBaseline and pending. Only `mislabelled` and `unreachable`
  // are member-facing: one sends a visitor to the wrong page, the other means a destination has
  // no path at all. A stale key names a default that no longer exists — it changes nothing a
  // renderer does, and it resolves itself the moment the surface is re-synced. Failing on it
  // would have made this instrument RED on the day it shipped, for five keys nobody can act on
  // usefully, and a report that is red for a harmless reason is a report people stop reading.
  const ok = mislabelled.length === 0 && unreachable.length === 0
  return { mislabelled, unreachable, pending, staleBaseline, ok, counts: { code: code.length, live: live.items.length } }
}

/** Markdown report. Silence means "checked and identical", so a clean run still says so. */
export function formatReport(r) {
  const out = [`\`${SURFACE}\`: ${r.counts.live} live rows against ${r.counts.code} code defaults.`, '']
  if (r.mislabelled.length) {
    out.push('🔴 **Mislabelled destination** (the link says one thing and lands on another):')
    for (const m of r.mislabelled) {
      out.push(`- "${m.label}" should point at \`${m.expected}\`, live row points at \`${m.actual}\``)
    }
    out.push('')
  }
  if (r.unreachable.length) {
    out.push('🔴 **Unreachable default** (absent from the DB and in the baseline, so the sync will never restore it):')
    for (const l of r.unreachable) out.push(`- "${l.label}" \`${l.href}\``)
    out.push('')
  }
  if (r.ok) {
    out.push('✅ Every code default is live and correctly labelled.')
    out.push('')
  } else {
    out.push('Repair in the Menu manager, or with a one-off script (model: `scripts/adr-1114-header-spaces-directory.sql`).')
    out.push('')
  }
  // Advisory, below the verdict, because neither of these changes what a visitor sees.
  if (r.staleBaseline.length) {
    out.push('⚠️ Advisory — stale baseline keys (name defaults that no longer exist, so they are inert):')
    out.push(`- ${r.staleBaseline.map((k) => `\`${k}\``).join(', ')}`)
    out.push('')
  }
  if (r.pending.length) {
    out.push('ℹ️ Advisory — pending injection (the next sync from defaults adds these):')
    for (const l of r.pending) out.push(`- "${l.label}" \`${l.href}\``)
    out.push('')
  }
  return out.join('\n').trimEnd()
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--print-query') {
    console.log(MENU_QUERY)
    return
  }
  const file = args[0]
  if (!file) {
    console.error('usage: menu-drift.mjs <menu.json>   |   menu-drift.mjs --print-query')
    process.exit(2)
  }
  const code = codeLeaves(readFileSync(REGISTRY, 'utf8'))
  const live = parseMenu(JSON.parse(readFileSync(file, 'utf8')))
  const result = compare(code, live)
  console.log(formatReport(result))
  if (!result.ok) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (e) {
    // An unreadable registry or an unparseable payload is a FAILURE, not a quiet skip: the whole
    // point of this instrument is that silence must mean "checked and identical".
    console.error(`🔴 menu-drift could not run: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}
