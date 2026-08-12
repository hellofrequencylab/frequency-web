#!/usr/bin/env node
// Cron freshness contract checker (H0-5/H0-8 · docs/OBSERVABILITY-BASELINES.md §4a).
//
// The heartbeat wrapper (lib/observability/cron-heartbeat.ts, H0-5) owns the PAGING: each cron
// pings a dead-man's-switch monitor on success. §4a of the baselines doc owns the CONTRACT that
// paging is measured against: every job in vercel.json must be "fresh", meaning its last success
// ping arrived within `schedule interval + 1 interval` of grace. This script is the operator-side
// companion that measures the contract.
//
// ── WHAT THIS CAN ESTABLISH, AND WHAT IT CANNOT ────────────────────────────────────────────────
//
// It reads the repo and its own process env. Nothing else: no database, no HTTP, no secret value.
// That splits the question into two halves, and only one of them is answerable here.
//
//   ✅ ESTABLISHED FROM THE REPO ALONE, so it is checked strictly:
//        · every cron in vercel.json has a route handler,
//        · that handler is WRAPPED in withCronHeartbeat, under the SAME job name,
//        · every schedule parses to a real interval, so the fresh-by window is a fact.
//      A job failing any of those can never ping ANY monitor, no matter what env is set. That is
//      the deepest form of paging-blind and it is a pure function of the tree.
//
//   ⚠️ NOT ESTABLISHED HERE, so it is reported and never asserted:
//        · whether CRON_HEARTBEAT_BASE_URL is set in Vercel Production. This process is not that
//          process. A var absent HERE means absent here, and reading that as "production is
//          paging-blind" is a claim the run cannot support. (Until 2026-08-11 this script made
//          exactly that claim, on every machine, and after the owner armed the base URL in Vercel
//          it was printing "27 paging-blind" about a system that was covered.)
//        · whether the monitor provider actually PROVISIONED a check per job. A base ping key
//          RESOLVES a URL for all 27 jobs; the Healthchecks.io free tier holds 20 of them and
//          rejects the rest, so resolution is not provisioning (docs/FINALIZE-PLAN.md §7c).
//        · whether pings are actually ARRIVING. That is the real freshness question and it needs a
//          read-only Healthchecks API key (`HEALTHCHECKS_API_KEY`), which nobody has set. Nothing
//          in this file pretends otherwise, and there is no fetch here to pretend with.
//
// So the verdict has three states, not two: covered, blind (only where the observation is
// authoritative), and NOT ESTABLISHED. The third is the honest state of the monitor half from any
// machine that is not the deployment runtime, and it is never printed as a clean bill of health.
//
// ── WHERE IT RUNS ──────────────────────────────────────────────────────────────────────────────
//
// The weekly maintenance sweep (.github/workflows/maintenance.yml), NOT the ci.yml guard array.
// Two reasons, both structural. It measures live operational state, so a red build on it would be
// a build failing for something no pull request can fix, which is how a gate dies (ADR-970). And
// its monitor
// half depends on deployment env that CI does not have, so on a PR it could only ever report NOT
// ESTABLISHED, every time, for every author. Advisory there, scheduled here, strict about the
// half that is genuinely deterministic.
//
// Usage:
//   node scripts/cron-freshness.mjs              # the freshness contract table
//   node scripts/cron-freshness.mjs --markdown   # the report the sweep posts + files
//   node scripts/cron-freshness.mjs --json       # machine-readable
//   node scripts/cron-freshness.mjs --strict     # also exit 1 unless coverage is established
//
// Exit codes:
//   0  the wiring contract holds. The monitor half may be NOT ESTABLISHED; that is advisory.
//   1  the wiring contract is broken, the corpus is too small to believe, or (--strict) coverage
//      is not established and complete.
//
// Env (all optional, presence-only, never read for value):
//   CRON_HEARTBEAT_BASE_URL        base monitor URL, resolves a URL for every job
//   CRON_HEARTBEAT_URL_<SLUG>      per-job monitor URL (SLUG = job name upper-snake)

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const VERCEL_JSON = 'vercel.json'
export const CRON_DIR = 'app/api/cron'

/**
 * THE FLOOR. A gate that scans nothing reports a clean bill of health, and here that would be
 * loud: zero crons means zero uncovered crons, so an unreadable vercel.json prints a perfect
 * coverage table. Same idiom as MIN_PAGES in check-templates.mjs and MIN_ROWS in
 * ledger-parity.mjs.
 *
 * 15, measured against 27 on 2026-08-11. The corpus has only ever grown (19 crons when
 * docs/MAINTENANCE-AUTOMATION.md §1 was written, 27 now), so 15 sits below the smallest count
 * this repo has ever had while still catching a read that silently collapses. A deliberate cull
 * of a third of the crons would trip it, which is the right moment to look at this number.
 *
 * The floor is on the JOB LIST and not on coverage, because coverage legitimately reads as zero
 * from any machine that is not the deployment (see the header). A floor that fires on the correct
 * state is a floor everybody learns to skip.
 */
export const MIN_JOBS = 15

/** What the monitor provider has agreed to hold, recorded 2026-08-11 in docs/FINALIZE-PLAN.md
 *  §7c: Healthchecks.io free tier, 20 checks, and vercel.json declares 27 jobs. It is written
 *  down here because a shared base key makes all 27 jobs LOOK covered while 7 of them are
 *  rejected on first ping, and which 7 lose is decided by schedule order. Reported, never
 *  asserted: this script cannot see the account, so it can only say that resolution is not
 *  provisioning. Set to 0 once the tier is upgraded and the caveat stops printing. */
export const MONITOR_CAPACITY = 20

const defaultIo = () => ({
  read: (p) => readFileSync(p, 'utf8'),
  readdir: (d) => readdirSync(d).map(String),
  exists: existsSync,
  env: process.env,
})

/** job name ('weekly-digest') to env-var suffix ('WEEKLY_DIGEST'). Mirrors envSlug() in
 *  lib/observability/cron-heartbeat.ts so coverage is checked against the exact var the wrapper
 *  resolves at runtime. */
export function envSlug(jobName) {
  return jobName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

/**
 * Expand one cron field to the sorted set of values it fires on, or null if the shape is not
 * understood. Handles `*`, `n`, `a-b`, `*` / `a-b` / `n` with a `/step`, and comma lists of any
 * of those.
 *
 * Refusing (null) rather than guessing is the point. The previous version of this file fell back
 * to "assume daily" for anything it did not recognise, which silently gave `15,45 * * * *` a
 * fresh-by window of 2 days when the job runs every 30 minutes: 96x too loose, printed as a fact.
 * The comment excused it on the grounds that "a too-loose one is caught by the human reading the
 * table", and the whole reason this now runs on a schedule is that no human is reading the table.
 */
export function expandField(spec, lo, hi) {
  const out = new Set()
  for (const raw of String(spec).split(',')) {
    const part = raw.trim()
    const m = /^(\*|\d{1,2}(?:-\d{1,2})?)(?:\/(\d{1,2}))?$/.exec(part)
    if (!m) return null
    const step = m[2] === undefined ? 1 : Number(m[2])
    if (step < 1) return null
    let start
    let end
    if (m[1] === '*') {
      start = lo
      end = hi
    } else if (m[1].includes('-')) {
      const [a, b] = m[1].split('-').map(Number)
      start = a
      end = b
    } else {
      start = Number(m[1])
      // `n/step` means "from n, every step" (a range open to the top); a bare `n` is one value.
      end = m[2] === undefined ? Number(m[1]) : hi
    }
    if (start < lo || end > hi || end < start) return null
    for (let v = start; v <= end; v += step) out.add(v)
  }
  return out.size ? [...out].sort((a, b) => a - b) : null
}

const unparsed = (schedule, why) => ({
  parsed: false,
  minutes: null,
  label: schedule,
  why,
})

/**
 * The gap between consecutive runs, which is what the §4a grace is one of.
 *
 * Takes the LARGEST gap in the cycle, not the average and not the smallest: fresh-by has to cover
 * the longest legitimate silence or the monitor pages on a healthy job, and a monitor that cries
 * wolf gets muted, which costs more than having none.
 */
export function parseSchedule(schedule) {
  const fields = String(schedule).trim().split(/\s+/)
  if (fields.length !== 5) return unparsed(schedule, `expected 5 fields, got ${fields.length}`)
  const [minF, hourF, domF, monF, dowF] = fields

  const minutes = expandField(minF, 0, 59)
  const hours = expandField(hourF, 0, 23)
  if (!minutes) return unparsed(schedule, `minute field "${minF}" not understood`)
  if (!hours) return unparsed(schedule, `hour field "${hourF}" not understood`)
  if (monF !== '*') return unparsed(schedule, `month field "${monF}" is not supported, so the interval would be a guess`)
  if (domF !== '*' && dowF !== '*') {
    return unparsed(schedule, 'day-of-month and day-of-week are both restricted (cron ORs them), so the interval is ambiguous')
  }
  if (domF !== '*') return unparsed(schedule, `day-of-month "${domF}" is not supported, so the interval would be a guess`)

  // Build every firing offset inside one cycle, then take the largest wrap-around gap.
  let cycle
  let offsets
  if (dowF === '*') {
    cycle = 1440
    offsets = []
    for (const h of hours) for (const m of minutes) offsets.push(h * 60 + m)
  } else {
    // 0 and 7 are both Sunday in cron.
    const days = expandField(dowF, 0, 7)
    if (!days) return unparsed(schedule, `day-of-week field "${dowF}" not understood`)
    const norm = [...new Set(days.map((d) => d % 7))].sort((a, b) => a - b)
    cycle = 7 * 1440
    offsets = []
    for (const d of norm) for (const h of hours) for (const m of minutes) offsets.push(d * 1440 + h * 60 + m)
  }
  offsets = [...new Set(offsets)].sort((a, b) => a - b)
  if (offsets.length === 0) return unparsed(schedule, 'no firing times')

  let gap = offsets.length === 1 ? cycle : 0
  for (let i = 1; i < offsets.length; i++) gap = Math.max(gap, offsets[i] - offsets[i - 1])
  gap = Math.max(gap, offsets[0] + cycle - offsets[offsets.length - 1])

  return { parsed: true, minutes: gap, label: cadenceLabel(gap), why: null }
}

function cadenceLabel(gap) {
  if (gap === 60) return 'hourly'
  if (gap === 1440) return 'daily'
  if (gap === 10080) return 'weekly'
  if (gap < 60) return `every ${gap} min`
  if (gap % 60 === 0 && gap < 1440) return `every ${gap / 60} h`
  return `every ${fmtMinutes(gap)}`
}

/** §4a contract: a job is fresh if its last success ping arrived within the interval plus one
 *  interval of grace. So fresh-by = 2 x interval. */
export function freshByMinutes(interval) {
  return interval * 2
}

export function fmtMinutes(m) {
  if (m == null) return 'unknown'
  if (m < 60) return `${m} min`
  if (m < 1440) return `${(m / 60).toFixed(m % 60 ? 1 : 0)} h`
  return `${(m / 1440).toFixed(m % 1440 ? 1 : 0)} d`
}

/** Line and block comments blanked out, so a wrapper named only in a comment is not read as
 *  wiring. Length-preserving is unnecessary here (nothing reports line numbers), so this is the
 *  cheap version. */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * How a job's route handler is wired to the heartbeat. This is the half that decides whether a
 * ping can EVER happen, and it needs nothing but the tree:
 *   'wrapped'   the handler composes withCronHeartbeat under the same job name.
 *   'bare'      a handler exists and never pings. No env setting can rescue it.
 *   'mismatch'  it pings under a different name than the route, so the monitor slug and the
 *               CRON_HEARTBEAT_URL_<SLUG> override both point at something else.
 *   'missing'   vercel.json schedules a path with no route. Vercel calls it, gets a 404, and the
 *               job neither runs nor pings.
 */
export function handlerWiring(job, io = {}) {
  const { read, exists } = { ...defaultIo(), ...io }
  const path = `${CRON_DIR}/${job}/route.ts`
  if (!exists(path)) return { state: 'missing', path, name: null }
  let src
  try {
    src = read(path)
  } catch (e) {
    return { state: 'missing', path, name: null, why: e instanceof Error ? e.message : String(e) }
  }
  const m = /withCronHeartbeat\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/.exec(stripComments(src))
  if (!m) return { state: 'bare', path, name: null }
  if (m[1] !== job) return { state: 'mismatch', path, name: m[1] }
  return { state: 'wrapped', path, name: m[1] }
}

/** True if a heartbeat monitor RESOLVES for this job, by the same order as resolveHeartbeatUrl():
 *  per-job override first, then the shared base. Presence-only, the value is never read. */
export function monitorFor(job, env) {
  if (env[`CRON_HEARTBEAT_URL_${envSlug(job)}`]) return 'per-job'
  if (env.CRON_HEARTBEAT_BASE_URL) return 'base'
  return null
}

/**
 * Is this process's env the one the crons actually run in? Only on Vercel is the absence of a
 * heartbeat var evidence of anything. Everywhere else (a laptop, a CI runner) absence is just
 * absence-here, and the honest verdict is NOT ESTABLISHED.
 */
export function isDeploymentRuntime(env) {
  return env.VERCEL === '1' || env.VERCEL === 'true'
}

/** Read the job list from vercel.json, plus the handler dirs, and join them. Throws on anything
 *  that would make the corpus a lie: see MIN_JOBS. */
export function readModel(io = {}) {
  const merged = { ...defaultIo(), ...io }
  let parsed
  try {
    parsed = JSON.parse(merged.read(VERCEL_JSON))
  } catch (e) {
    throw new Error(`could not read ${VERCEL_JSON}: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!Array.isArray(parsed.crons)) {
    throw new Error(`${VERCEL_JSON} has no \`crons\` array. With no jobs to check there is nothing this can report but a vacuous pass.`)
  }
  const jobs = parsed.crons.map((c) => {
    const job = String(c.path || '').replace(/^\/api\/cron\//, '').replace(/^\/+/, '')
    const schedule = parseSchedule(String(c.schedule || ''))
    return {
      job,
      path: c.path,
      schedule: c.schedule,
      cadence: schedule.label,
      parsed: schedule.parsed,
      why: schedule.why,
      intervalMin: schedule.minutes,
      freshByMin: schedule.parsed ? freshByMinutes(schedule.minutes) : null,
      wiring: handlerWiring(job, merged),
      monitor: monitorFor(job, merged.env),
    }
  })
  if (jobs.length < MIN_JOBS) {
    throw new Error(
      `read ${jobs.length} cron job(s) from ${VERCEL_JSON}, expected at least ${MIN_JOBS}. ` +
        'Zero jobs means zero uncovered jobs, so this is a broken read rather than a clean run.',
    )
  }

  // The inverse set: a handler nobody schedules never runs, and its monitor would page forever.
  let dirs = []
  try {
    dirs = merged.readdir(CRON_DIR)
  } catch {
    dirs = []
  }
  const scheduled = new Set(jobs.map((j) => j.job))
  const unscheduled = dirs.filter((d) => !scheduled.has(d) && !d.includes('.')).sort()

  return { jobs: jobs.sort((a, b) => (a.intervalMin ?? Infinity) - (b.intervalMin ?? Infinity)), unscheduled }
}

/**
 * The verdict. Split deliberately into what the tree proves and what the env merely suggests.
 *
 * `wiringBroken` is issue-worthy and exits 1: a bare, mismatched or missing handler is a job that
 * cannot ping under any configuration, established from the repo alone.
 *
 * `coverage` is one of:
 *   'covered'        every job resolves a monitor from the env seen here.
 *   'blind'          no monitor resolves AND this IS the deployment runtime, so absence is real.
 *   'not-established' no monitor resolves and this is not the deployment runtime. Advisory: it is
 *                    the state of every laptop and every CI runner, and reading it as failure
 *                    would fail builds for a fact about someone else's dashboard.
 */
export function assess(model, env = process.env) {
  const { jobs, unscheduled } = model
  const unparsedJobs = jobs.filter((j) => !j.parsed)
  const badWiring = jobs.filter((j) => j.wiring.state !== 'wrapped')
  const uncovered = jobs.filter((j) => !j.monitor)
  const runtime = isDeploymentRuntime(env)

  let coverage
  if (uncovered.length === 0) coverage = 'covered'
  else if (runtime) coverage = 'blind'
  else if (uncovered.length === jobs.length) coverage = 'not-established'
  // Partial coverage off the deployment runtime: what resolved, resolved, but what did not is
  // still only unobserved-here. Report it as partial rather than calling those jobs blind.
  else coverage = 'partial'

  const viaBase = jobs.some((j) => j.monitor === 'base')
  const overCapacity = viaBase && MONITOR_CAPACITY > 0 && jobs.length > MONITOR_CAPACITY

  return {
    jobs,
    unscheduled,
    unparsedJobs,
    badWiring,
    uncovered,
    coverage,
    runtime,
    overCapacity,
    capacity: MONITOR_CAPACITY,
    // Everything here is a fact about the tree. Nothing about a dashboard can fail this run.
    failed: unparsedJobs.length > 0 || badWiring.length > 0,
  }
}

const WIRING_NOTE = {
  wrapped: 'wrapped',
  bare: 'NOT WRAPPED',
  mismatch: 'NAME MISMATCH',
  missing: 'NO HANDLER',
}

// ── Renderers ──────────────────────────────────────────────────────────────────────────────────

/** The operator table: what `pnpm check:cron-freshness` prints. */
export function renderText(a) {
  const lines = []
  lines.push('Cron freshness contract (H0-5/H0-8) · docs/OBSERVABILITY-BASELINES.md §4a')
  lines.push('='.repeat(88))

  const jw = 32
  lines.push(`${'Job'.padEnd(jw)}${'Cadence'.padEnd(14)}${'Fresh-by'.padStart(9)}   ${'Heartbeat'.padEnd(14)}Monitor`)
  lines.push('-'.repeat(88))
  for (const r of a.jobs) {
    const monitor = r.monitor ? `configured (${r.monitor})` : a.runtime ? 'NONE, paging-blind' : 'not observable here'
    const cadence = r.parsed ? r.cadence : 'UNPARSED'
    lines.push(
      `${r.job.padEnd(jw)}${cadence.padEnd(14)}${(r.parsed ? fmtMinutes(r.freshByMin) : '?').padStart(9)}   ` +
        `${WIRING_NOTE[r.wiring.state].padEnd(14)}${monitor}`,
    )
  }
  lines.push('-'.repeat(88))
  lines.push(`${a.jobs.length} jobs · ${a.jobs.length - a.badWiring.length} wired to the heartbeat`)
  lines.push(`Coverage: ${coverageSentence(a)}.`)
  lines.push('')
  for (const line of findings(a)) lines.push(line)
  if (lines[lines.length - 1] !== '') lines.push('')
  lines.push('Fresh-by = 2 x schedule interval (the interval plus one interval of grace, §4a). A job')
  lines.push('whose last success ping is older than its fresh-by window is a §4 SLO breach.')
  return lines.join('\n')
}

/** The report the sweep posts to the step summary and files into the tracking issue. Short by
 *  design: a weekly report nobody reads is the same failure as a gate nobody runs. */
export function renderMarkdown(a) {
  const lines = []
  const wired = a.jobs.length - a.badWiring.length
  lines.push(
    a.failed
      ? `🔴 Cron heartbeat wiring BROKEN: ${wired} of ${a.jobs.length} jobs can ping a monitor.`
      : `✅ Cron heartbeat wiring: all ${a.jobs.length} jobs are wrapped in \`withCronHeartbeat\` under their own name, and every schedule parses.`,
  )
  lines.push('')
  lines.push(`Coverage: ${coverageSentence(a)}.`)
  lines.push('')
  for (const line of findings(a)) lines.push(line)
  if (lines[lines.length - 1] !== '') lines.push('')
  lines.push(
    '_Fresh-by = 2 x the schedule interval (§4a). This step checks the wiring and the contract, ' +
      'not whether pings are arriving: that needs a read-only Healthchecks API key, which is not set. ' +
      'See docs/OBSERVABILITY-BASELINES.md §4a and docs/MAINTENANCE-AUTOMATION.md item 7._',
  )
  return lines.join('\n')
}

function coverageSentence(a) {
  switch (a.coverage) {
    case 'covered':
      return `a monitor URL resolves for all ${a.jobs.length} jobs from this environment's env`
    case 'blind':
      return `🔴 ${a.uncovered.length} of ${a.jobs.length} jobs resolve NO monitor, and this IS the deployment runtime, so they are paging-blind`
    case 'partial':
      return `${a.jobs.length - a.uncovered.length} of ${a.jobs.length} jobs resolve a monitor here; the rest are NOT ESTABLISHED from this environment`
    default:
      return 'ℹ️ NOT ESTABLISHED. No CRON_HEARTBEAT_* var is visible here, and this is not the deployment runtime, so nothing about production coverage follows'
  }
}

/** The specifics, in the order they cost: wiring first (it is proven), then the caveats. */
function findings(a) {
  const lines = []
  if (a.badWiring.length) {
    lines.push(`🔴 ${a.badWiring.length} job(s) cannot ping any monitor, whatever the env says:`)
    for (const j of a.badWiring) {
      const state = j.wiring.state
      const detail =
        state === 'missing'
          ? `no handler at \`${j.wiring.path}\`, so Vercel's call 404s and the job never runs`
          : state === 'bare'
            ? `\`${j.wiring.path}\` does not compose \`withCronHeartbeat\`, so a success never pings`
            : `\`${j.wiring.path}\` pings as \`${j.wiring.name}\`, not \`${j.job}\`, so the monitor slug and \`CRON_HEARTBEAT_URL_${envSlug(j.job)}\` both miss`
      lines.push(`- \`${j.job}\`: ${detail}`)
    }
    lines.push('')
  }
  if (a.unparsedJobs.length) {
    lines.push(`🔴 ${a.unparsedJobs.length} schedule(s) did not parse, so their fresh-by window would be fiction:`)
    for (const j of a.unparsedJobs) lines.push(`- \`${j.job}\`: \`${j.schedule}\` (${j.why})`)
    lines.push('')
    lines.push('  Teach `parseSchedule` the shape rather than letting the window be a guess.')
    lines.push('')
  }
  if (a.unscheduled.length) {
    lines.push(
      `⚠️ ${a.unscheduled.length} cron handler(s) with no \`crons\` entry in ${VERCEL_JSON}: ` +
        a.unscheduled.map((d) => `\`${d}\``).join(', ') + '. Nothing invokes them.',
    )
    lines.push('')
  }
  if (a.overCapacity) {
    lines.push(
      `⚠️ ${a.jobs.length} jobs share one base ping key, and the monitor account holds ${a.capacity} checks ` +
        '(docs/FINALIZE-PLAN.md §7c). A URL that resolves is not a check that exists: the first ' +
        `${a.capacity} to ping take the slots and the other ${a.jobs.length - a.capacity} are rejected, chosen by ` +
        'schedule order rather than by what a silent death costs. Upgrade the tier, or pin the ones ' +
        'that matter with `CRON_HEARTBEAT_URL_<SLUG>`.',
    )
    lines.push('')
  }
  if (a.coverage === 'not-established' || a.coverage === 'partial') {
    lines.push(
      'ℹ️ The monitor half is owner config living in Vercel Production, not in this runner. To make ' +
        'it observable here, mirror `CRON_HEARTBEAT_BASE_URL` as a repo secret (presence only, the ' +
        'value is never read). To measure whether pings are actually ARRIVING, which is the real ' +
        'freshness question, a read-only `HEALTHCHECKS_API_KEY` would be needed; none is set, so no ' +
        'run of this script has ever measured it.',
    )
    lines.push('')
  }
  if (!lines.length) lines.push('No findings.')
  return lines
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────

export function main(argv = process.argv.slice(2), io = {}) {
  const args = new Set(argv)
  const merged = { ...defaultIo(), ...io }
  const model = readModel(merged)
  const a = assess(model, merged.env)

  if (args.has('--json')) {
    console.log(
      JSON.stringify(
        {
          jobCount: a.jobs.length,
          wired: a.jobs.length - a.badWiring.length,
          coverage: a.coverage,
          deploymentRuntime: a.runtime,
          uncovered: a.uncovered.map((r) => r.job),
          unscheduledHandlers: a.unscheduled,
          overCapacity: a.overCapacity,
          jobs: a.jobs.map((r) => ({
            job: r.job,
            schedule: r.schedule,
            cadence: r.cadence,
            scheduleParsed: r.parsed,
            intervalMin: r.intervalMin,
            freshByMin: r.freshByMin,
            heartbeat: r.wiring.state,
            monitorConfigured: r.monitor !== null,
            monitorSource: r.monitor,
          })),
        },
        null,
        2,
      ),
    )
  } else if (args.has('--markdown')) {
    console.log(renderMarkdown(a))
  } else {
    console.log(renderText(a))
  }

  if (a.failed) return 1
  // --strict is for a caller that has the deployment env (a Vercel build hook), where "cannot
  // establish" must not read as "pass". Off the runtime it will refuse, which is correct: a gate
  // that cannot measure has not passed.
  if (args.has('--strict') && a.coverage !== 'covered') return 1
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main()
  } catch (e) {
    // A floor breach or an unreadable vercel.json is a FAILURE, not a quiet skip. Silence from
    // this script has to mean "checked", never "could not look".
    console.error(`🔴 cron-freshness could not run: ${e instanceof Error ? e.message : String(e)}`)
    process.exitCode = 1
  }
}
