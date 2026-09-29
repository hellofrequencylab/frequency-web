// Cron heartbeat / dead-man's-switch wrapper (H0-5).
//
// Wraps a Vercel Cron route handler so that:
//   • on SUCCESS  → pings a dead-man's-switch monitor URL (e.g. Better Stack /
//                   Healthchecks.io / a Sentry Cron check-in URL). If the ping
//                   stops arriving, the monitor pages a human — a silently-dead
//                   `process-queue` / `weekly-digest` / `season-go-live` is exactly
//                   the failure this prevents.
//   • on FAILURE  → reports the error to Sentry (tagged by job) AND optionally pings
//                   a per-monitor "/fail" endpoint, then RE-THROWS so Next still
//                   returns 5xx and the existing run-log behaviour is unchanged.
//   • ALWAYS      → emits ONE `cron.run` line carrying `job`, `status`, `ok` and
//                   `duration_ms`, whatever the outcome. See the block on the wrapper.
//
// SAFE NO-OP WHEN UNCONFIGURED. With no heartbeat env vars, the success ping is
// skipped (handler return value is untouched); with no Sentry DSN, the failure
// capture is an inert no-op. Either way the wrapped handler runs exactly as before
// and the wrapper NEVER changes the handler's response or swallows its errors — a
// monitoring outage can't take a cron down.
//
// Monitor URL resolution (first match wins):
//   1. CRON_HEARTBEAT_URL_<SLUG>  — per-job override (SLUG = job name upper-snake)
//   2. CRON_HEARTBEAT_BASE_URL    — base; the job name is appended as the final
//                                   path segment (`${base}/${jobName}`)
// On failure, if a base URL is configured the wrapper pings `${monitorUrl}/fail`
// (the Healthchecks/Better Stack convention) so a failed run is recorded distinctly.

import * as Sentry from '@sentry/nextjs'
import { setObservabilityTags } from '@/lib/observability/tags'
import { isCronMonitored } from '@/lib/observability/slos'
import { log } from '@/lib/log'

// A Next.js route handler: takes the Request and returns a Response. Generic over
// the request type `R` so handlers typed with the narrower `NextRequest` are
// accepted without a contravariance error under `strictFunctionTypes` (every route
// here is invoked by Next with a real NextRequest, so this is sound). The wrapper
// only ever reads `Request` members, so it never relies on the wider type.
type CronHandler<R extends Request = Request> = (req: R) => Promise<Response> | Response

/** Turn a job name ('weekly-digest') into the env-var suffix ('WEEKLY_DIGEST'). */
function envSlug(jobName: string): string {
  return jobName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

/** Job names that deliberately have NO monitor, from `CRON_HEARTBEAT_SKIP` (comma-separated).
 *
 *  🔴 WHY THIS EXISTS, because "fewer log lines" is not the reason (LIVE-217). A monitor plan
 *  smaller than the cron fleet — Healthchecks' free tier caps at 20 checks and `vercel.json`
 *  declares 28 — leaves some jobs pinging a check that does not exist, and the monitor answers
 *  404. That 404 is byte-identical to the one that means someone deleted a check, rotated the
 *  ping key, or let the account lapse. `OWN-065` (the whole fleet silently unmonitored) was
 *  findable only because that line was rare; at ~200 a day it is background, and the next real
 *  one is invisible. An expected failure that looks exactly like an unexpected one is how the
 *  original defect hid.
 *
 *  ⚠️ THE LIST IS AN ALLOW-LIST OF SILENCE, AND IT MUST STAY SHORT AND EXPLICIT. Read the
 *  default carefully: a job NOT named here still pings, so a cron added next month is monitored
 *  the day it ships. Inverting that — "no monitor unless configured" — would silently unmonitor
 *  whatever someone forgot to wire, which is the same class of failure this mechanism exists to
 *  end. A typo in this list is safe in the same direction: the job keeps pinging and keeps
 *  saying so. */
function heartbeatOptOut(jobName: string): boolean {
  const raw = process.env.CRON_HEARTBEAT_SKIP
  if (!raw) return false
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .includes(jobName)
}

/** Resolve the dead-man's-switch monitor URL for a job, or null if it has none.
 *
 *  Null means "do not ping", and it covers two different situations that are deliberately
 *  identical HERE and different in the record: nothing is configured at all (the safe no-op this
 *  module has always had), or this job is named in `CRON_HEARTBEAT_SKIP` as having no monitor on
 *  purpose. Either way `pingHeartbeat` returns before it can emit a `ping_failed` line, which is
 *  the point — an expected silence must not be reported as a failure. */
export function resolveHeartbeatUrl(jobName: string): string | null {
  // Checked BEFORE the per-job override and the base URL, so opting a job out is one edit and
  // does not require also unsetting whatever would otherwise resolve for it.
  if (heartbeatOptOut(jobName)) return null

  const perJob = process.env[`CRON_HEARTBEAT_URL_${envSlug(jobName)}`]
  if (perJob) return perJob

  const base = process.env.CRON_HEARTBEAT_BASE_URL
  if (base) return `${base.replace(/\/+$/, '')}/${jobName}`

  return null
}

/** Jobs this process has already escalated a heartbeat gap for (LIVE-548). One Sentry event
 *  per job per process is the rate limit: a monitored job whose monitor is gone says so once
 *  per deploy instead of once per run, and the per-run record stays in the warn line. */
const escalatedJobs = new Set<string>()

/** Clears the once-per-process escalation memory. Test seam only. */
export function resetHeartbeatEscalationForTests(): void {
  escalatedJobs.clear()
}

/** Fire a heartbeat ping. Best-effort and crash-proof: failures to ping are logged
 *  but never thrown, so the monitor transport can't affect the cron's own outcome.
 *  A ping that is REJECTED (a non-2xx answer) is logged too — `fetch` does not throw
 *  on one, so without the status check a monitor saying "no" is indistinguishable
 *  from a monitor saying "yes". `fail` appends the `/fail` suffix used by
 *  Healthchecks-style monitors.
 *
 *  🔴 FOR A JOB IN `CRON_MONITORED`, A PING THAT DOES NOT LAND IS ESCALATED (LIVE-548,
 *  ADR-1574). The warn line below is the record; it is not a signal. Two monitored jobs
 *  404ed on every ping for two weeks into `cron.heartbeat.ping_failed` lines nobody
 *  queried (OWN-070), and for those two weeks their dead-man's switch was dead: a job
 *  that dies looks exactly like a job that is healthy and unwired. So when the job is one
 *  the repo says is monitored (lib/observability/slos.ts), a rejected or failed ping is
 *  also a Sentry event tagged by job, once per job per process. An opt-out that still
 *  pings (not yet in CRON_HEARTBEAT_SKIP) keeps its warn line and escalates nothing:
 *  its silence was chosen, and the line is the expected one. */
async function pingHeartbeat(
  jobName: string,
  opts: { fail?: boolean } = {},
): Promise<void> {
  const url = resolveHeartbeatUrl(jobName)
  if (!url) {
    // A monitored job named in CRON_HEARTBEAT_SKIP has no monitor and the repo says it
    // should: the two declarations disagree, and neither side can see the other. Say so
    // once per process; it is a configuration fact, not a run outcome, so no Sentry event.
    if (heartbeatOptOut(jobName) && isCronMonitored(jobName) && !escalatedJobs.has(`skip:${jobName}`)) {
      escalatedJobs.add(`skip:${jobName}`)
      log.warn('cron.heartbeat.monitored_but_skipped', {
        job: jobName,
        error: 'CRON_MONITORED names this job and CRON_HEARTBEAT_SKIP silences it; one of them is wrong',
      })
    }
    return // unconfigured → no-op
  }

  /** The escalation. Textually inside this function on purpose: the row's probe reads
   *  the body of `pingHeartbeat` for the Sentry call, so a refactor that moves it out
   *  fails the ledger rather than silently un-wiring it. */
  const escalate = (error: string, status: number | null) => {
    if (!isCronMonitored(jobName) || escalatedJobs.has(jobName)) return
    escalatedJobs.add(jobName)
    try {
      Sentry.captureMessage(`cron heartbeat for monitored job "${jobName}" did not land: ${error}`, {
        level: 'error',
        tags: { route: `cron.${jobName}`, cron_job: jobName, heartbeat_fail: String(opts.fail === true) },
        extra: { job: jobName, fail: opts.fail === true, status, error },
      })
    } catch {
      // The escalation is a fail-safe on a fail-safe. It never takes the cron down.
    }
  }

  const target = opts.fail ? `${url}/fail` : url
  try {
    // A short timeout so a hung monitor never delays the cron response.
    const res = await fetch(target, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      // We don't care about the body; some monitors accept run output here.
      cache: 'no-store',
    })
    // 🔴 A REJECTED PING IS A FAILED FAIL-SAFE, AND `fetch` DOES NOT THROW ON ONE.
    // fetch only rejects on a transport error, so a monitor that ANSWERS "no" —
    // Healthchecks.io returning 400/404 for an unknown check, or 429 once the
    // account is over its check cap (the free tier caps at 20 and vercel.json
    // declares 27, OWN-005) — used to land in the success path and emit nothing.
    // The dead-man's-switch would then be silently dead: no ping arriving looks
    // exactly like a healthy cron that was never wired, and nothing would say so.
    // Same event name and field shape as the transport-failure line below, so one
    // query over `cron.heartbeat.ping_failed` finds both kinds of failure; `status`
    // is what tells them apart (a transport error has no status).
    if (!res.ok) {
      const error = `monitor rejected the ping (HTTP ${res.status})`
      log.warn('cron.heartbeat.ping_failed', {
        job: jobName,
        fail: opts.fail === true,
        status: res.status,
        error,
      })
      escalate(error, res.status)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn('cron.heartbeat.ping_failed', { job: jobName, fail: opts.fail === true, error: message })
    escalate(message, null)
  }
}

/**
 * Wrap a cron route handler with success/failure heartbeats + Sentry reporting.
 *
 *   export const GET = withCronHeartbeat('process-queue', async (req) => { ... })
 *
 * `jobName` should match the route segment under app/api/cron/ (and the vercel.json
 * `path`) so the env-var/monitor mapping is obvious.
 */
/** The platform's hard ceiling on one invocation (Vercel: 300 s). A cron that reaches it is killed,
 *  and with the claim-then-send discipline (ADR-1212) its unfinished tail is retried next run, so a
 *  cron whose window grows faster than its budget falls further behind every invocation. */
export const CRON_CEILING_MS = 300_000

/** The per-invocation WORK BUDGET a cron is held to unless its route declares its own (LIVE-190):
 *  a fifth of the ceiling. It is a budget, not a limit — nothing is killed here — and the point of
 *  stating it in the seam is that every route has one from the day it is wrapped, so the
 *  `cron.run` chart has a line to read against instead of only the ceiling it can never see a
 *  route approach in time. A route with a genuinely larger unit of work declares a larger budget
 *  beside its handler, where the number is reviewed with the work it bounds. */
export const DEFAULT_CRON_BUDGET_MS = CRON_CEILING_MS / 5

interface CronHeartbeatOptions {
  /** The stated per-invocation budget for this route, in ms. Defaults to DEFAULT_CRON_BUDGET_MS. */
  budgetMs?: number
}

/** A response header a cron handler sets when the RUN finished but an SLO the job owns is breached
 *  (LIVE-547, ADR-1571): the value is the reason, in stable words. The wrapper then pings the monitor's
 *  `/fail` endpoint instead of the alive endpoint and leaves the response alone, so the check stays
 *  down for as long as the breach lasts and the first clean run brings it back up.
 *
 *  Why a header and not the two obvious alternatives. A handler that returned 500 to reach the fail
 *  path would make the next cron redo work that was fine (and would count a healthy drain as a failed
 *  run). A handler that fail-pinged on its own would be followed by this wrapper's alive-ping a few
 *  milliseconds later, so the monitor would flap down and up on every two-minute drain while the
 *  breach lasted. The header lets the handler say "done, but not well" and lets the ONE place that
 *  pings decide which endpoint hears it. Ignored on a 4xx or 5xx: those already have their rule. */
export const CRON_SLO_BREACH_HEADER = 'x-cron-slo-breach'

export function withCronHeartbeat<R extends Request = Request>(
  jobName: string,
  handler: CronHandler<R>,
  options: CronHeartbeatOptions = {},
): CronHandler<R> {
  const budgetMs = options.budgetMs ?? DEFAULT_CRON_BUDGET_MS
  /** The one `cron.run` line, on every path. `over_budget` is the reading LIVE-190 charts: a
   *  route that keeps crossing its stated budget is one whose window needs batching or narrowing
   *  BEFORE it reaches the ceiling, which is the only thing the error group could ever see. */
  const runLine = (status: number, startedMs: number) => {
    const durationMs = Date.now() - startedMs
    const fields = {
      job: jobName,
      status,
      ok: status < 400,
      duration_ms: durationMs,
      budget_ms: budgetMs,
      over_budget: durationMs > budgetMs,
    }
    log.info('cron.run', fields)
    if (fields.over_budget) log.warn('cron.over_budget', { job: jobName, duration_ms: durationMs, budget_ms: budgetMs })
  }
  return async function wrapped(req: R): Promise<Response> {
    // Tag any Sentry event raised inside the handler with the job route so cron
    // failures are filterable. No-op when Sentry is off.
    setObservabilityTags({ route: `cron.${jobName}` })

    // ── THE DURATION INSTRUMENT LIVES HERE, IN THE SEAM, AND THAT IS THE POINT ────────────
    // LIVE-190 wants a per-invocation work budget for the crons, and its re-scoped first step is
    // to read DURATION rather than errors: the `Task timed out after 300 seconds` group only fires
    // at the CEILING, so it can only ever see a cron that has already failed. A cron trending
    // toward the ceiling is invisible to it.
    //
    // `log.time` was already available and EIGHT of twenty-seven routes had adopted it, which is
    // the shape of an instrument that will never be complete: the nineteen that matter most on a
    // busy week are exactly the ones nobody remembered to wrap, and a cron added next month starts
    // uninstrumented again. Putting the timer in the wrapper every cron already goes through makes
    // the coverage structural, and `scripts/cron-freshness.test.ts` ALREADY fails a scheduled cron
    // that is not wrapped — so the guard that keeps this universal exists and needed no new gate.
    //
    // ⚠️ NOT `log.time(...)` AROUND THE HANDLER, deliberately: it decides `ok` by whether the
    // function threw, and a cron that RETURNS a 500 has not thrown. That would log the loudest
    // failure mode as a success. `ok` here reads the response status, the same rule the fail-ping
    // below already uses.
    //
    // The clock stops before the heartbeat ping, which is a network call to a third party and has
    // nothing to do with how long the job's work took.
    const startedMs = Date.now()

    try {
      const res = await handler(req)
      runLine(res.status, startedMs)
      // A 5xx (returned, not thrown) is a job failure → fail-ping. A 4xx is a
      // client/auth problem (e.g. an unauthorized probe rejected by
      // rejectUnauthorizedCron), NOT the job dying — don't fail-ping those, or a
      // legitimate Vercel-Cron 401-probe would page a human. Everything <500 that
      // isn't a 4xx (i.e. 2xx/3xx) is a healthy run → alive-ping.
      //
      // A 2xx carrying CRON_SLO_BREACH_HEADER is a run that finished with an SLO breached: fail-ping
      // instead of alive-ping (see the header's block), and say why on its own line so one query
      // over `cron.slo_breach` finds every such run.
      const breach = res.status < 400 ? res.headers.get(CRON_SLO_BREACH_HEADER) : null
      if (res.status >= 500 || breach) {
        if (breach) log.warn('cron.slo_breach', { job: jobName, breach })
        await pingHeartbeat(jobName, { fail: true })
      } else if (res.status < 400) {
        await pingHeartbeat(jobName)
      }
      return res
    } catch (err) {
      // Report to Sentry (tagged), record a structured log line, ping the fail
      // endpoint, then RE-THROW so Next returns 5xx and nothing is swallowed.
      Sentry.captureException(err, { tags: { route: `cron.${jobName}`, cron_job: jobName } })
      const message = err instanceof Error ? err.message : String(err)
      // The same line on the throw path, so a chart of `cron.run` covers every invocation rather
      // than only the ones that got as far as returning. A run that dies at 280s is the reading
      // this row most needs and is precisely the one a success-only instrument loses.
      runLine(500, startedMs)
      log.error('cron.failed', { job: jobName, error: message })
      await pingHeartbeat(jobName, { fail: true })
      throw err
    }
  }
}
