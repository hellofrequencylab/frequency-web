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

/** Resolve the dead-man's-switch monitor URL for a job, or null if unconfigured. */
export function resolveHeartbeatUrl(jobName: string): string | null {
  const perJob = process.env[`CRON_HEARTBEAT_URL_${envSlug(jobName)}`]
  if (perJob) return perJob

  const base = process.env.CRON_HEARTBEAT_BASE_URL
  if (base) return `${base.replace(/\/+$/, '')}/${jobName}`

  return null
}

/** Fire a heartbeat ping. Best-effort and crash-proof: failures to ping are logged
 *  but never thrown, so the monitor transport can't affect the cron's own outcome.
 *  `fail` appends the `/fail` suffix used by Healthchecks-style monitors. */
async function pingHeartbeat(
  jobName: string,
  opts: { fail?: boolean } = {},
): Promise<void> {
  const url = resolveHeartbeatUrl(jobName)
  if (!url) return // unconfigured → no-op

  const target = opts.fail ? `${url}/fail` : url
  try {
    // A short timeout so a hung monitor never delays the cron response.
    await fetch(target, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      // We don't care about the body; some monitors accept run output here.
      cache: 'no-store',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn('cron.heartbeat.ping_failed', { job: jobName, fail: opts.fail === true, error: message })
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
export function withCronHeartbeat<R extends Request = Request>(
  jobName: string,
  handler: CronHandler<R>,
): CronHandler<R> {
  return async function wrapped(req: R): Promise<Response> {
    // Tag any Sentry event raised inside the handler with the job route so cron
    // failures are filterable. No-op when Sentry is off.
    setObservabilityTags({ route: `cron.${jobName}` })

    try {
      const res = await handler(req)
      // A 5xx (returned, not thrown) is a job failure → fail-ping. A 4xx is a
      // client/auth problem (e.g. an unauthorized probe rejected by
      // rejectUnauthorizedCron), NOT the job dying — don't fail-ping those, or a
      // legitimate Vercel-Cron 401-probe would page a human. Everything <500 that
      // isn't a 4xx (i.e. 2xx/3xx) is a healthy run → alive-ping.
      if (res.status >= 500) {
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
      log.error('cron.failed', { job: jobName, error: message })
      await pingHeartbeat(jobName, { fail: true })
      throw err
    }
  }
}
