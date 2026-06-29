#!/usr/bin/env node
// Cost baseline harness (H0-7 · docs/OBSERVABILITY-BASELINES.md).
//
// Snapshots spend by vendor and derives the per-1k-members unit cost, so scale
// decisions in H3 (geocoder swap, partitioning, CDN, read replicas) are cost-aware.
//
// SAFE NO-OP WHEN UNCONFIGURED. With no *_MONTHLY_SPEND_USD env vars set, it prints
// the per-vendor + unit-economics TEMPLATE only. Set the (non-sensitive) dollar
// figures from each vendor's billing console and BASELINE_ACTIVE_MEMBERS to compute
// the per-1k-members costs for OBSERVABILITY-BASELINES §3b. It reads NO secret (no
// API key, DSN, or service-role key). Only plain dollar amounts you copy in.
//
// Usage:
//   node scripts/cost-baseline.mjs          # template + any computed unit costs
//   node scripts/cost-baseline.mjs --json   # machine-readable output
//
// Env (all optional; unset rows print as "_tbd_"):
//   BASELINE_ACTIVE_MEMBERS     denominator for per-1k unit cost
//   SUPABASE_MONTHLY_SPEND_USD  this month's Supabase bill
//   VERCEL_MONTHLY_SPEND_USD    this month's Vercel bill
//   ANTHROPIC_MONTHLY_SPEND_USD this month's Anthropic bill
//   RESEND_MONTHLY_SPEND_USD    this month's Resend bill
//   UPSTASH_MONTHLY_SPEND_USD   this month's Upstash bill

const args = new Set(process.argv.slice(2))
const asJson = args.has('--json')

function num(name) {
  const raw = process.env[name]
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const VENDORS = [
  { id: 'supabase', label: 'Supabase', driver: 'DB compute + storage + egress', env: 'SUPABASE_MONTHLY_SPEND_USD' },
  { id: 'vercel', label: 'Vercel', driver: 'function invocations + bandwidth', env: 'VERCEL_MONTHLY_SPEND_USD' },
  { id: 'anthropic', label: 'Anthropic', driver: 'tokens (Haiku-default)', env: 'ANTHROPIC_MONTHLY_SPEND_USD' },
  { id: 'resend', label: 'Resend', driver: 'emails sent / month', env: 'RESEND_MONTHLY_SPEND_USD' },
  { id: 'upstash', label: 'Upstash', driver: 'commands / month', env: 'UPSTASH_MONTHLY_SPEND_USD' },
]

const members = num('BASELINE_ACTIVE_MEMBERS')
const per1kUnits = members && members > 0 ? members / 1000 : null

const rows = VENDORS.map((v) => {
  const spend = num(v.env)
  const per1k = spend != null && per1kUnits ? spend / per1kUnits : null
  return { ...v, spend, per1k }
})

const totalSpend = rows.reduce((sum, r) => (r.spend != null ? sum + r.spend : sum), 0)
const anySpend = rows.some((r) => r.spend != null)
const totalPer1k = anySpend && per1kUnits ? totalSpend / per1kUnits : null

function fmt(n, dollars = true) {
  if (n == null) return '_tbd_'
  return dollars ? `$${n.toFixed(2)}` : String(n)
}

if (asJson) {
  console.log(
    JSON.stringify(
      {
        activeMembers: members,
        vendors: rows.map((r) => ({ id: r.id, spendUsd: r.spend, per1kUsd: r.per1k })),
        totalSpendUsd: anySpend ? totalSpend : null,
        totalPer1kUsd: totalPer1k,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

console.log('Cost baseline (H0-7) · docs/OBSERVABILITY-BASELINES.md')
console.log('='.repeat(64))
if (!anySpend) {
  console.log('No *_MONTHLY_SPEND_USD env vars set: template mode.')
  console.log('Copy each vendor bill into the env vars (see header) to compute unit costs.\n')
}
console.log(`Active members (denominator): ${members != null ? members : '_tbd_ (set BASELINE_ACTIVE_MEMBERS)'}\n`)

const w = 12
console.log(`${'Vendor'.padEnd(12)}${'Spend/mo'.padStart(w)}${'Per 1k mbr'.padStart(w)}   Driver`)
console.log('-'.repeat(64))
for (const r of rows) {
  console.log(
    `${r.label.padEnd(12)}${fmt(r.spend).padStart(w)}${fmt(r.per1k).padStart(w)}   ${r.driver}`,
  )
}
console.log('-'.repeat(64))
console.log(
  `${'TOTAL'.padEnd(12)}${fmt(anySpend ? totalSpend : null).padStart(w)}${fmt(totalPer1k).padStart(w)}`,
)
console.log('\nPaste these into OBSERVABILITY-BASELINES §3a (spend) and §3b (per-1k).')
console.log('Re-run monthly; the per-1k trend is what H3 is judged against.')
