#!/usr/bin/env node
// Cron freshness contract checker (H0-5/H0-8 · docs/OBSERVABILITY-BASELINES.md §4a).
//
// The heartbeat wrapper (lib/observability/cron-heartbeat.ts, H0-5) owns the PAGING:
// each cron pings a dead-man's-switch monitor on success. §4a of the baselines doc
// owns the CONTRACT that paging is measured against: every one of the 18 jobs must be
// "fresh" — its last success ping arrived within `schedule interval + 1 interval` of
// grace. This script is the operator-side companion that:
//
//   1. reads the crons from vercel.json (the source of truth for the job list),
//   2. parses each schedule to its interval and derives the §4a fresh-by window,
//   3. reports, per job, whether a heartbeat monitor is CONFIGURED (using the exact
//      env convention resolveHeartbeatUrl() uses) so coverage gaps are visible, and
//   4. exits non-zero (when --strict) if any job lacks monitor coverage — so this can
//      gate a deploy or run in CI as a "no cron is paging-blind" check.
//
// SAFE: reads NO secret. It only checks for the PRESENCE of a heartbeat env var, never
// its value, and never pings anything. With no env configured it runs in documentation
// mode: it still prints the full freshness contract (the useful default), and only
// turns coverage gaps into a failure under --strict.
//
// Usage:
//   node scripts/cron-freshness.mjs            # print the freshness contract table
//   node scripts/cron-freshness.mjs --json     # machine-readable output
//   node scripts/cron-freshness.mjs --strict   # exit 1 if any job has no monitor
//
// Env (all optional; presence-only, never read for value):
//   CRON_HEARTBEAT_BASE_URL        base monitor URL → covers every job
//   CRON_HEARTBEAT_URL_<SLUG>      per-job monitor URL (SLUG = job name upper-snake)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const args = new Set(process.argv.slice(2))
const asJson = args.has('--json')
const strict = args.has('--strict')

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

/** job name ('weekly-digest') → env-var suffix ('WEEKLY_DIGEST'). Mirrors
 *  envSlug() in lib/observability/cron-heartbeat.ts so coverage is checked against
 *  the exact var the wrapper resolves at runtime. */
function envSlug(jobName) {
  return jobName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

/** True if a heartbeat monitor is configured for this job, by the same resolution
 *  order as resolveHeartbeatUrl(): per-job override first, then the shared base.
 *  Presence-only — the value is never read or printed. */
function hasMonitor(jobName) {
  if (process.env[`CRON_HEARTBEAT_URL_${envSlug(jobName)}`]) return 'per-job'
  if (process.env.CRON_HEARTBEAT_BASE_URL) return 'base'
  return null
}

// Estimate a cron schedule's run interval in minutes. Covers the shapes vercel.json
// actually uses: "*/N * * * *" (every N min), "M * * * *" (hourly at M), "M H * * *"
// (daily), and "M H * * D" (weekly). Returns { minutes, label }; minutes is the gap
// between consecutive runs, which is what the §4a grace is one of. Unknown shapes
// fall back to a conservative daily (1440) so they are never treated as more frequent
// than they are — a too-tight window would false-page, a too-loose one is caught by
// the human reading the table.
function intervalMinutes(schedule) {
  const f = schedule.trim().split(/\s+/)
  if (f.length !== 5) return { minutes: 1440, label: schedule }
  const [min, hour, dom, , dow] = f

  // every-N-minutes: "*/N * * * *"
  const stepMin = /^\*\/(\d+)$/.exec(min)
  if (stepMin && hour === '*') {
    return { minutes: Number(stepMin[1]), label: `every ${stepMin[1]} min` }
  }
  // hourly: fixed minute, wildcard hour
  if (/^\d+$/.test(min) && hour === '*') {
    return { minutes: 60, label: 'hourly' }
  }
  // weekly: a specific day-of-week
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dow !== '*') {
    return { minutes: 7 * 1440, label: 'weekly' }
  }
  // daily: fixed minute + hour, any day
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*') {
    return { minutes: 1440, label: 'daily' }
  }
  return { minutes: 1440, label: schedule }
}

/** §4a contract: a job is fresh if its last success ping arrived within
 *  (interval + one interval of grace). So fresh-by = 2 × interval. */
function freshByMinutes(interval) {
  return interval * 2
}

function fmtMinutes(m) {
  if (m < 60) return `${m} min`
  if (m < 1440) return `${(m / 60).toFixed(m % 60 ? 1 : 0)} h`
  return `${(m / 1440).toFixed(m % 1440 ? 1 : 0)} d`
}

function loadCrons() {
  const raw = readFileSync(join(repoRoot, 'vercel.json'), 'utf8')
  const parsed = JSON.parse(raw)
  const crons = Array.isArray(parsed.crons) ? parsed.crons : []
  return crons
    .map((c) => {
      const job = String(c.path || '').replace(/^\/api\/cron\//, '').replace(/^\/+/, '')
      const interval = intervalMinutes(String(c.schedule || ''))
      const freshBy = freshByMinutes(interval.minutes)
      return {
        job,
        path: c.path,
        schedule: c.schedule,
        cadence: interval.label,
        intervalMin: interval.minutes,
        freshByMin: freshBy,
        monitor: hasMonitor(job),
      }
    })
    .sort((a, b) => a.intervalMin - b.intervalMin)
}

function main() {
  const rows = loadCrons()
  const uncovered = rows.filter((r) => !r.monitor)
  const anyMonitor = rows.some((r) => r.monitor)

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          jobCount: rows.length,
          covered: rows.length - uncovered.length,
          uncovered: uncovered.map((r) => r.job),
          jobs: rows.map((r) => ({
            job: r.job,
            schedule: r.schedule,
            cadence: r.cadence,
            intervalMin: r.intervalMin,
            freshByMin: r.freshByMin,
            monitorConfigured: r.monitor !== null,
            monitorSource: r.monitor,
          })),
        },
        null,
        2,
      ),
    )
    process.exitCode = strict && uncovered.length > 0 ? 1 : 0
    return
  }

  console.log('Cron freshness contract (H0-5/H0-8) · docs/OBSERVABILITY-BASELINES.md §4a')
  console.log('='.repeat(76))
  if (!anyMonitor) {
    console.log('No CRON_HEARTBEAT_* env configured: documentation mode (coverage column')
    console.log('shows where a monitor would be read from). Set CRON_HEARTBEAT_BASE_URL to')
    console.log('cover every job, or CRON_HEARTBEAT_URL_<SLUG> per job. Values never read.\n')
  }

  const jw = 26
  console.log(
    `${'Job'.padEnd(jw)}${'Cadence'.padEnd(12)}${'Fresh-by'.padStart(10)}   Monitor`,
  )
  console.log('-'.repeat(76))
  for (const r of rows) {
    const monitor = r.monitor ? `configured (${r.monitor})` : 'NONE — paging-blind'
    console.log(
      `${r.job.padEnd(jw)}${r.cadence.padEnd(12)}${fmtMinutes(r.freshByMin).padStart(10)}   ${monitor}`,
    )
  }
  console.log('-'.repeat(76))
  console.log(
    `${rows.length} jobs · ${rows.length - uncovered.length} with a monitor · ${uncovered.length} paging-blind`,
  )

  if (uncovered.length > 0) {
    console.log(
      `\nPaging-blind jobs (a silent death would not page): ${uncovered.map((r) => r.job).join(', ')}`,
    )
    console.log('Fix: set CRON_HEARTBEAT_BASE_URL (covers all) or a per-job URL. See')
    console.log('lib/observability/cron-heartbeat.ts for the resolution order.')
  }
  console.log(
    '\nFresh-by = 2 × schedule interval (interval + one interval of grace, §4a). A job',
  )
  console.log('whose last success ping is older than its fresh-by window is a §4 SLO breach.')

  process.exitCode = strict && uncovered.length > 0 ? 1 : 0
}

main()
