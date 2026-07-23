#!/usr/bin/env node
// Community Collective phase gate — the "stay on course" verifier (ADR-811).
//
// Run after each major build in the Community Collective rebuild
// (docs/COMMUNITY-COLLECTIVE-BUILD-PLAN.md). It reviews connections + wiring, hunts legacy
// references, sanity-checks migrations, and checks SEO/AIO alignment against the ONE source
// of truth (docs/COMMUNITY-COLLECTIVE-STRATEGY.md). It reports per-phase readiness so we can
// see at a glance what is wired, what is pending, and what has drifted off-plan.
//
// Exit code: NON-ZERO only on a genuine inconsistency (a half-wired tier, an off-plan legacy
// reintroduction). Not-yet-built phases report ⏳ and never fail (so it is safe to run from
// Phase 1 onward). Expected-until-later legacy (e.g. old prices in marketing prose before the
// Phase 6 rebrand) reports as a tracked ⚠ COUNT, never a hard fail.
//
// Usage: `node scripts/check-collective.mjs` (or `pnpm check:collective`).
// This is the STATIC half of the phase gate. The full gate also runs, per the build plan:
//   pnpm lint && pnpm test && pnpm build && pnpm check:menu && pnpm check:canon && pnpm check:seo
//   plus migration/advisor drift via scripts/maintenance/sweep.mts.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── The north star: the six tiers are Member / Crew / Business / Collective / Non Profit / Independent
// (docs/COMMUNITY-COLLECTIVE-STRATEGY.md). The NEW space tiers this rebuild introduces (must be fully
// wired once they appear anywhere) are: ──
const NEW_SPACE_TIERS = ['collective', 'independent']

let hardFail = 0
const line = (s) => console.log(s)
const ok = (s) => line(`  ✓ ${s}`)
const pending = (s) => line(`  ⏳ ${s}`)
const warn = (s) => line(`  ⚠ ${s}`)
const fail = (s) => { line(`  ✗ ${s}`); hardFail++ }

const read = (p) => { try { return readFileSync(p, 'utf8') } catch { return null } }
const has = (p) => existsSync(p)

function grepCount(dir, re, exts) {
  let n = 0
  const hits = []
  const walk = (d) => {
    let entries
    try { entries = readdirSync(d) } catch { return }
    for (const e of entries) {
      if (e === 'node_modules' || e === '.next' || e === '.git') continue
      const p = join(d, e)
      let s
      try { s = statSync(p) } catch { continue }
      if (s.isDirectory()) walk(p)
      else if (exts.some((x) => e.endsWith(x))) {
        const txt = read(p)
        if (!txt) continue
        txt.split('\n').forEach((l, i) => { if (re.test(l)) { n++; hits.push(`${p}:${i + 1}`) } })
      }
    }
  }
  walk(dir)
  return { n, hits }
}

line('\n── Community Collective phase gate ──────────────────────────────────────────\n')

// ── 0 · North star present (guards against losing/drifting from the source of truth) ──
line('Phase 0 · Canon & source of truth')
{
  const strat = 'docs/COMMUNITY-COLLECTIVE-STRATEGY.md'
  const plan = 'docs/COMMUNITY-COLLECTIVE-BUILD-PLAN.md'
  const decisions = read('docs/DECISIONS.md') ?? ''
  if (has(strat)) ok('strategy source of truth present'); else fail(`${strat} MISSING (the north star)`)
  if (has(plan)) ok('build plan present'); else fail(`${plan} MISSING`)
  if (/ADR-811/.test(decisions)) ok('ADR-811 recorded'); else fail('ADR-811 not found in docs/DECISIONS.md')
  const naming = read('docs/NAMING.md') ?? ''
  if (/Community Collective/.test(naming)) ok('NAMING.md carries the Community Collective canon'); else fail('NAMING.md not amended')
}

// ── 1 · Tier taxonomy wiring (cross-file consistency). A new tier must be wired EVERYWHERE. ──
line('\nPhase 1 · Pricing engine — tier wiring')
{
  const plans = read('lib/pricing/plans.ts')
  if (!plans) { pending('lib/pricing/plans.ts not readable — skipping'); }
  else {
    // The surfaces where a tier must appear as a bare token to resolve consistently: the label/entitlement
    // map (plans), the display+ladder (feature-tiers), and the price defaults (settings). The Stripe catalog
    // (pricing-keys) uses distinct item-key naming (business_base, nonprofit_seat), so it is checked as a
    // separate sellability layer, not here.
    const surfaces = {
      'plans.ts': read('lib/pricing/plans.ts') ?? '',
      'feature-tiers.ts': read('lib/pricing/feature-tiers.ts') ?? '',
      'settings.ts': read('lib/pricing/settings.ts') ?? '',
    }
    for (const tier of NEW_SPACE_TIERS) {
      const present = Object.entries(surfaces).filter(([, txt]) => new RegExp(`\\b${tier}\\b`).test(txt)).map(([k]) => k)
      if (present.length === 0) pending(`tier "${tier}" not introduced yet`)
      else if (present.length === Object.keys(surfaces).length) ok(`tier "${tier}" wired across the label + display + price surfaces`)
      else fail(`tier "${tier}" is HALF-WIRED — only in: ${present.join(', ')} (add it to the rest, or it will resolve inconsistently)`)
    }
    // Reprice sanity: Business must not still read as flat $49 in the settings default.
    const settings = surfaces['settings.ts']
    if (/business:\s*\{[^}]*\b4900\b/.test(settings)) warn('settings.ts still shows Business at $49 — reprice to $29')
  }
}

// ── 2 · Differential take-rate wiring (the critical-path subsystem) ──
line('\nPhase 2 · Differential take-rate — attribution wiring')
{
  const fees = read('lib/billing/fees.ts') ?? ''
  const sourceAware = /source\s*[:?]\s*['"]?(self|network)/.test(fees) || /'network'\s*\|\s*'self'|'self'\s*\|\s*'network'/.test(fees)
  if (!sourceAware) pending('take-rate is not yet source-aware (self vs network) — Phase 2 not started')
  else {
    ok('fees.ts is source-aware (self/network)')
    const callSites = ['lib/commerce/checkout.ts', 'lib/commerce/orders.ts', 'lib/billing/tickets.ts', 'lib/billing/tips.ts']
    const missing = callSites.filter((p) => { const t = read(p); return t && !/source\s*[:.]/.test(t) })
    if (missing.length) fail(`take-rate source not threaded into: ${missing.join(', ')} (a self-booking could be billed a network rate)`)
    else ok('all commerce call sites thread a source')
    const orderMig = grepCount('supabase/migrations', /commerce_orders[\s\S]*\b(source|attribution)\b|add column[^\n]*\bsource\b/i, ['.sql'])
    if (orderMig.n > 0) ok('order attribution migration present'); else fail('fees are source-aware but no order-attribution migration found')
  }
}

// ── 3 · network_connected wiring (in-collective vs standalone) ──
line('\nPhase 3 · network_connected — in-collective vs standalone')
{
  const discovery = read('lib/spaces/discovery.ts') ?? ''
  if (/network_connected/.test(discovery)) ok('discovery reads network_connected')
  else pending('network_connected not yet driving discovery/pricing — Phase 3 not started')
}

// ── 4 · Legacy / off-plan tripwires (don't rabbit-trail; keep the canon clean) ──
line('\nGuardrails · Legacy & off-plan tripwires')
{
  // Hard fail: the retired "no tier names" lock must not be reasserted as live canon anywhere in code/docs prose.
  const noTierNames = grepCount('docs', /no tier names/i, ['.md'])
  // Allowed only where it is explicitly described as RETIRED/superseded (NAMING + the ADRs).
  const badNoTierNames = noTierNames.hits.filter((h) => {
    const [file, ln] = h.split(':'); const txt = read(file); if (!txt) return false
    const allLines = txt.split('\n')
    // OK if the hit itself is annotated as retired within ±3 lines...
    const context = allLines.slice(Math.max(0, +ln - 3), +ln + 2).join(' ')
    if (/retire|supersed|amend|ADR-811|historical/i.test(context)) return false
    // ...or the whole file carries a superseded/historical banner near the top (how the repo marks retired docs).
    const banner = allLines.slice(0, 15).join(' ')
    if (/supersed|historical/i.test(banner)) return false
    return true
  })
  if (badNoTierNames.length) fail(`"no tier names" asserted as live canon (retired by ADR-811): ${badNoTierNames.join(', ')}`)
  else ok('the retired "no tier names" lock is only referenced as history')

  // Tracked (not a fail): old hardcoded prices in member-facing prose, expected until the Phase 6 rebrand.
  const oldBusinessPrice = grepCount('content', /\$49\b/, ['.md']).n + grepCount('lib/marketing', /\$49\b/, ['.ts', '.tsx']).n
  const oldHomeCrew = grepCount('app', /\$10 a month|\$10\/mo/, ['.tsx']).n
  if (oldBusinessPrice > 0) warn(`${oldBusinessPrice} hardcoded "$49" reference(s) in prose (reprice in Phase 6 marketing)`); else ok('no stale $49 in marketing prose')
  if (oldHomeCrew > 0) warn(`${oldHomeCrew} hardcoded Crew "$10" reference(s) in app copy (fix in Phase 6)`); else ok('no stale Crew "$10" in app copy')
}

// ── 6/7 · SEO / AIO alignment ──
line('\nPhase 6-7 · SEO / AIO alignment')
{
  const llms = read('app/llms.txt/route.ts') ?? ''
  const site = read('lib/site.ts') ?? ''
  if (/Community Collective/.test(llms)) ok('llms.txt reflects the Community Collective model'); else pending('llms.txt not yet rebranded (Phase 7)')
  if (/Community Collective/i.test(site)) ok('site.ts tagline rebranded'); else pending('site.ts tagline not yet rebranded (Phase 6)')
}

// ── Migration constraint sanity ──
line('\nMigrations · CHECK-constraint coverage')
{
  const migDir = 'supabase/migrations'
  const itemKeyCheck = grepCount(migDir, /space_subscription_items[\s\S]*item_key|item_key[^\n]*check/i, ['.sql'])
  const anyCollectiveItem = grepCount(migDir, /'collective'|'independent'/, ['.sql']).n
  const plansTxt = read('lib/pricing/plans.ts') ?? ''
  const usesNewTiers = NEW_SPACE_TIERS.some((t) => new RegExp(`['"\`]${t}['"\`]`).test(plansTxt))
  if (usesNewTiers && itemKeyCheck.n > 0 && anyCollectiveItem === 0) {
    warn('new tiers exist in code but no migration adds them to the item_key CHECK — confirm subscription-items path is unaffected, or add the constraint swap')
  } else ok('no item_key CHECK gap detected')
}

line('\n─────────────────────────────────────────────────────────────────────────────')
if (hardFail > 0) {
  console.error(`\n✖ phase gate: ${hardFail} inconsistency/off-plan issue(s). Fix before the phase is done.\n`)
  process.exit(1)
}
console.log('\n✓ phase gate: no inconsistencies or off-plan drift. ⏳ = phase not started, ⚠ = tracked follow-up.\n')
