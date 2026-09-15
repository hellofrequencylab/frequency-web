#!/usr/bin/env node
// db-usage — how close is the database account to its ceiling, and how much of the load is ours?
// (LIVE-336)
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
// On 2026-09-15, 04:23Z to 04:41Z, the Supabase account hit its ceiling and every preview
// deployment failed for eighteen minutes. The builds failing was CORRECT — LIVE-325 had just
// taught a menu read that fails during `next build` to fail the build rather than ship default
// menus — so the outage surfaced loudly. What did not surface was the cause.
//
// 🔴 THE SHAPE OF THAT FAILURE IS THE ARGUMENT FOR THIS FILE. The control plane reported the
// project ACTIVE_HEALTHY throughout. A status read said everything was fine while every query
// failed, so the one signal an operator would reach for first was the one signal that could not
// move. Nothing in the repo, in CI, or in the maintenance sweep read anything that WOULD have.
//
// The load is ours. ADR-1328 measured the build loop's own traffic at 1,200 to 2,900 PostgREST
// reads per table per fifteen minutes for a single profile; LIVE-326 serialised the runs and
// LIVE-328 removed the prefetch multiplier inside each one, so it is lower than it was, and
// neither of those notices a ceiling. This is the instrument that notices.
//
// ── WHAT IT MEASURES, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────────────────────
// Three readings out of one SELECT, and only ONE of them is a ceiling:
//
//   1. CONNECTIONS, against `max_connections`. The only hard ceiling the database declares about
//      itself, so it is the only figure here that gets a percentage and a verdict tier.
//   2. REQUEST VOLUME — transactions and rows read, over a STATED window. `pg_stat_database`
//      counters are cumulative since `stats_reset`, and on this project `stats_reset` is NULL
//      (the stats have never been reset), so the window is anchored on
//      `pg_postmaster_start_time()` instead and the report says which anchor it used. A rate
//      with no window is a number with no meaning.
//   3. DATABASE SIZE, in bytes. Reported flat, with NO percentage.
//
// ⚠️ NO PLAN QUOTA IS READ, and that is on purpose rather than an omission. The account's plan
// ceiling — the thing that was actually hit — is not exposed to the database role this reads as,
// and inventing a denominator would produce a confident percentage of a made-up number. That is
// worse than no percentage: it is the ACTIVE_HEALTHY failure again, wearing this script's name.
// So volume and size are a TREND, read weekly, and the trend is the instrument. The reading
// history lives in the run summaries, not in this file (AGENTS.md: watch the trend, not the
// number).
//
// ── IT IS A READING, NEVER A BLOCKING GATE ──────────────────────────────────────────────────
// The step in .github/workflows/maintenance.yml runs under `set +e` and never fails the sweep.
// A weekly job going red because a connection count moved would teach everyone to stop reading
// it, which is exactly how ADR-970 says a gate gets routed around. The exit code exists only to
// ROUTE the finding: the sweep's tracking issue is the owner.
//
// 🔴 AND IT MUST NEVER REPORT "COULD NOT LOOK" AS "FINE". A read that failed is not a read that
// agreed (ADR-970). Hence four outcomes, never three:
//
//   exit 0   a reading was taken and every ceiling has headroom
//   exit 1   a reading was taken and a ceiling is at or over its threshold — goes to the issue
//   exit 79  INDETERMINATE: no payload, or a payload that carried no reading — also goes to the
//            issue, because a dead instrument is precisely what a sweep must not swallow
//   exit 2   usage error (no argument at all)
//
// Usage:
//   node scripts/maintenance/db-usage.mjs --print-query    # the SQL for the fetch step
//   node scripts/maintenance/db-usage.mjs usage.json       # read a fetched payload, report
//   node scripts/maintenance/db-usage.mjs --payload '<json>'  # same, from an inline payload
//
// The `--payload` form is how the instrument is exercised without a database: the LIVE-336
// backlog probe drives both the green arm and the indeterminate arm through it, and so can a
// human. Same division of labour as its three siblings here — the workflow step performs the
// credentialled read, this script never touches a database and stays testable without one.

import { readFileSync } from 'node:fs'

/** Who reads this when it is not green. Named in the report itself, because a reading nobody
 *  owns is a reading nobody acts on (ADR-1326). */
export const OWNER = 'the weekly maintenance tracking issue ("🔧 Weekly maintenance sweep")'

/** Connections as a fraction of `max_connections`. Chosen against the 2026-09-15 15:00Z reading
 *  of 45 of 90 (50%): a doubling of the resting load is worth a look, and 90% is the point at
 *  which a burst of previews can no longer connect at all. */
export const WARN_AT = 0.75
export const CRITICAL_AT = 0.9

/**
 * The read. One SELECT, one json object, so the workflow step needs a single request and the
 * three readings are all taken at the same instant.
 *
 * `coalesce(d.stats_reset, pg_postmaster_start_time())` is the whole reason the volume figures
 * mean anything: the counters are cumulative and `stats_reset` is NULL here, so without the
 * fallback anchor the window is unknown and a rate cannot be computed at all. `statsResetSeen`
 * travels with it so the report can say WHICH anchor it used rather than implying the tidier one.
 */
export const USAGE_QUERY = `
select json_build_object(
  'maxConnections', current_setting('max_connections')::int,
  'connections', (select count(*) from pg_stat_activity),
  'clientBackends', (select count(*) from pg_stat_activity where backend_type = 'client backend'),
  'dbBytes', pg_database_size(current_database()),
  'transactions', d.xact_commit + d.xact_rollback,
  'rowsRead', d.tup_returned + d.tup_fetched,
  'statsSince', coalesce(d.stats_reset, pg_postmaster_start_time()),
  'statsResetSeen', d.stats_reset is not null,
  'windowSeconds', round(extract(epoch from (now() - coalesce(d.stats_reset, pg_postmaster_start_time()))))
) as usage
  from pg_stat_database d
 where d.datname = current_database();
`.trim()

const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * Pull the reading out of whatever shape the payload arrived in, or return null.
 *
 * 🔴 NULL IS THE INDETERMINATE SIGNAL and every caller must treat it as such. An empty array, a
 * Management API error envelope, a truncated body and a `{}` all land here, and none of them is
 * evidence that the ceiling is fine.
 */
export function parseUsage(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const rows = Array.isArray(parsed) ? parsed : (parsed?.result ?? parsed?.rows ?? [])
  const row = Array.isArray(rows) ? rows[0] : null
  const u = row?.usage ?? row
  if (!u || typeof u !== 'object') return null
  const maxConnections = num(u.maxConnections)
  const connections = num(u.connections)
  // Without BOTH halves of the one real ceiling there is no verdict to give, so this is not a
  // reading — it is an indeterminate one wearing a reading's clothes.
  if (maxConnections === null || connections === null || maxConnections <= 0) return null
  return {
    maxConnections,
    connections,
    clientBackends: num(u.clientBackends),
    dbBytes: num(u.dbBytes),
    transactions: num(u.transactions),
    rowsRead: num(u.rowsRead),
    statsSince: typeof u.statsSince === 'string' ? u.statsSince : null,
    statsResetSeen: u.statsResetSeen === true,
    windowSeconds: num(u.windowSeconds),
  }
}

/** `critical` / `warn` / `ok` for the one ceiling that exists. */
export function tier(reading) {
  const share = reading.connections / reading.maxConnections
  if (share >= CRITICAL_AT) return 'critical'
  if (share >= WARN_AT) return 'warn'
  return 'ok'
}

const int = (n) => (n === null ? '?' : n.toLocaleString('en-US'))
const pct = (n) => `${Math.round(n * 100)}%`

/** Seconds as something a human reads at a glance. */
export function duration(seconds) {
  if (seconds === null || seconds < 0) return 'an unknown window'
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const mib = (bytes) => (bytes === null ? '?' : `${(bytes / 1024 / 1024).toFixed(1)} MiB`)

/** Per-minute rate over the stated window, or null when there is no window to divide by. */
export function perMinute(total, windowSeconds) {
  if (total === null || windowSeconds === null || windowSeconds <= 0) return null
  return Math.round(total / (windowSeconds / 60))
}

/** The markdown a reading becomes. Silence is not an option here: a green reading still prints
 *  its numbers, because the whole value of a weekly reading is the series. */
export function report(reading) {
  const t = tier(reading)
  const share = reading.connections / reading.maxConnections
  const mark = t === 'critical' ? '🔴' : t === 'warn' ? '⚠️' : '✅'
  const anchor = reading.statsResetSeen ? 'the last stats reset' : 'postmaster start (stats never reset)'
  const lines = [
    `**Connections** — ${int(reading.connections)} of ${int(reading.maxConnections)} (${pct(share)})` +
      (reading.clientBackends === null ? '' : `, ${int(reading.clientBackends)} of them client backends`),
    t === 'critical'
      ? `${mark} AT OR OVER ${pct(CRITICAL_AT)} of \`max_connections\`. A burst of previews cannot connect.`
      : t === 'warn'
        ? `${mark} At or over ${pct(WARN_AT)} of \`max_connections\` — the resting load has roughly doubled.`
        : `${mark} Headroom. \`max_connections\` is the only ceiling the database declares about itself.`,
    '',
    `**Request volume** — since ${reading.statsSince ?? 'an unstated time'} (${duration(reading.windowSeconds)}, anchored on ${anchor})`,
    `- ${int(reading.transactions)} transactions` +
      (perMinute(reading.transactions, reading.windowSeconds) === null
        ? ''
        : ` · ~${int(perMinute(reading.transactions, reading.windowSeconds))}/min`),
    `- ${int(reading.rowsRead)} rows read` +
      (perMinute(reading.rowsRead, reading.windowSeconds) === null
        ? ''
        : ` · ~${int(perMinute(reading.rowsRead, reading.windowSeconds))}/min`),
    '',
    `**Database size** — ${mib(reading.dbBytes)}`,
    '',
    'ℹ️ Volume and size carry NO percentage on purpose: the account plan ceiling is not readable',
    'from this role, and a percentage of a guessed denominator is how a reading starts lying. They',
    'are a trend — compare this run against the previous weeks in the sweep summaries.',
    `OWNER: ${OWNER}.`,
  ]
  return { code: t === 'ok' ? 0 : 1, text: lines.join('\n'), tier: t }
}

/** What gets printed when the read did not happen. NEVER a verdict.
 *
 *  🔴 This is the half the row was filed about. The outage looked fine from the control plane, so
 *  an instrument that answers "no news" when it could not look reproduces the exact defect. */
export function indeterminate(why) {
  return {
    code: 79,
    tier: 'indeterminate',
    text: [
      `🔴 **Could not look** — ${why}`,
      '',
      'This is NOT a clean reading. The database account ceiling was not measured on this run, so',
      'nothing here says it has headroom (ADR-970: a read that failed is not a read that agreed).',
      `OWNER: ${OWNER}.`,
    ].join('\n'),
  }
}

function main(argv) {
  if (argv.includes('--print-query')) {
    console.log(USAGE_QUERY)
    return 0
  }
  const i = argv.indexOf('--payload')
  const inline = i >= 0 ? argv[i + 1] : undefined
  const file = argv.find((a) => !a.startsWith('--') && a !== inline)
  if (inline === undefined && !file) {
    console.error('usage: db-usage.mjs <usage.json> | --payload <json> | --print-query')
    return 2
  }
  let raw
  try {
    raw = inline !== undefined ? inline : readFileSync(file, 'utf8')
  } catch (e) {
    const r = indeterminate(`the payload could not be read: ${e instanceof Error ? e.message : String(e)}`)
    console.log(r.text)
    return r.code
  }
  let reading
  try {
    reading = parseUsage(raw)
  } catch (e) {
    const r = indeterminate(`the payload did not parse as JSON: ${e instanceof Error ? e.message : String(e)}`)
    console.log(r.text)
    return r.code
  }
  const r = reading
    ? report(reading)
    : indeterminate('the payload carried no connection reading (an API error envelope, or an empty result)')
  console.log(r.text)
  return r.code
}

if (process.argv[1] && process.argv[1].endsWith('db-usage.mjs')) process.exit(main(process.argv.slice(2)))
