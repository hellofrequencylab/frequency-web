// Read-only status index / discovery endpoint (H0-8 · docs/SLOs.md).
//
// The single entry point for the /api/status/* family. Where the sibling routes each
// serve one slice (GET /api/status/slos = raw targets, GET /api/status/error-budget =
// the budget each ratio target implies), this route is the INDEX: it lists every
// status endpoint with a one-line description, and carries a small at-a-glance summary
// (how many SLOs, how many page-vs-track, how many cron jobs are under a freshness
// window) so a dashboard, an uptime check, or an on-call engineer can hit one URL,
// learn what's available, and follow the links — instead of having to already know the
// sub-paths exist.
//
// SAFE BY CONSTRUCTION. No DB query, no secret, no auth-scoped data: it returns pure config +
// counts already published by the sibling routes, plus the build identity below. It reports NO
// live measurement — only the static contract and where to read it. GET-only, cached
// for an hour at the edge since the contract changes only on a deploy.
//
// ⚠️ It DOES now read env vars — the three VERCEL_GIT_*/VERCEL_ENV values in buildIdentity(),
// which are build metadata rather than configuration. That is the only env access here, and
// route.test.ts pins it: any other `process.env` read in this file fails the suite, because the
// "no secret" promise above is what makes this endpoint safe to hand to anyone debugging.

import { NextResponse } from 'next/server'
import { SLOS, CRON_FRESHNESS } from '@/lib/observability/slos'
import { sentryEnabled } from '@/lib/observability/sentry'
import { pushSendingEnabled } from '@/lib/push'

export const dynamic = 'force-static'
export const revalidate = 3600

/** The status endpoints this index links to. Keep in step with the routes that exist
 *  under app/api/status/ — adding a sibling route means adding a line here. */
const ENDPOINTS = [
  {
    path: '/api/status',
    method: 'GET',
    description:
      'This index. Lists the status endpoints and a summary of the SLO contract.',
  },
  {
    path: '/api/status/slos',
    method: 'GET',
    description:
      'The raw service SLO targets (availability, latency, error-rate, freshness) and per-cron freshness windows.',
  },
  {
    path: '/api/status/error-budget',
    method: 'GET',
    description:
      'The allowed-failure fraction each ratio SLO target implies, for computing burn against a live measurement.',
  },
] as const

/** Which build is answering. `dynamic = 'force-static'` means this route is rendered at
 *  BUILD time, so these values are frozen into the deployment that serves them — which is
 *  exactly what makes them trustworthy.
 *
 *  WHY THIS IS HERE. A production bug was chased for three rounds partly because nothing this
 *  app served carried build identity, so "did the fix actually deploy?" was unanswerable
 *  without the Vercel dashboard. A redeploy rebuilds the deployment you clicked, not `main`,
 *  so "I merged it and redeployed" is not evidence. One curl now settles it forever.
 *
 *  SAFE TO PUBLISH: a short commit SHA on a deployed build, nothing more. Sentry already
 *  ships the same SHA as its release tag (lib/observability/sentry.ts). No token, no path,
 *  no environment secret. */
/** Blank counts as absent. `??` does NOT cover this: an empty string is not nullish, so
 *  `process.env.X ?? 'unknown'` yields `''`, and Vercel really does set these empty on a
 *  deployment with no git link. `"commit": ""` in the triage output is the one answer worse
 *  than no field at all — it reads as "this build has no identity" when it means "this is not
 *  a git deploy". route.test.ts pins the empty case for that reason. */
function envOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function buildIdentity() {
  return {
    commit: envOrNull(process.env.VERCEL_GIT_COMMIT_SHA)?.slice(0, 7) ?? 'unknown',
    ref: envOrNull(process.env.VERCEL_GIT_COMMIT_REF),
    env: envOrNull(process.env.VERCEL_ENV) ?? envOrNull(process.env.NODE_ENV) ?? 'unknown',
  }
}

export function GET() {
  // Cheap, derived-from-config counts — no measurement, just shape of the contract.
  const pageCount = SLOS.filter((s) => s.onBreach === 'page').length
  const cronJobCount = CRON_FRESHNESS.reduce((n, w) => n + w.jobs.length, 0)

  return NextResponse.json(
    {
      // Which commit is live. Frozen at build time; see buildIdentity() for why it belongs here.
      build: buildIdentity(),
      // Two fail-safes that are invisible when they fire, published as booleans so one curl
      // answers "is this deployment actually able to do it?".
      //   sentry — the error recorder is a DSN-gated no-op (LIVE-053). /feed threw for six weeks
      //     with nothing recording it, because a swallowed error is an invisible regression.
      //   push  — sending is a VAPID-gated no-op (lib/push.ts). Production carries 24 push
      //     subscriptions, 5 from the last 30 days, so two dozen members have granted permission;
      //     whether a notification can LEAVE the process was answerable only from a dashboard, or
      //     by finding one console.warn in a runtime log. Note the asymmetry that made this worth
      //     publishing: push_subscriptions proves the PUBLIC key is served to browsers, and says
      //     nothing at all about the PRIVATE key the server sends with.
      // Both are booleanized at their source — never the DSN, never the key — and both freeze at
      // build like everything else here, so setting either needs a redeploy to show.
      monitoring: { sentry: sentryEnabled, push: pushSendingEnabled },
      // A timestamp so a consumer can tell roughly when it read the index; the
      // contract itself only changes on deploy (the response is statically cached).
      generatedAt: new Date().toISOString(),
      service: 'frequency',
      // Pure discovery: what's here and what each link gives you.
      endpoints: ENDPOINTS,
      // At-a-glance shape of the contract so the index is useful on its own; the
      // numbers behind these counts live in /api/status/slos.
      summary: {
        sloCount: SLOS.length,
        pageOnBreachCount: pageCount,
        trackOnBreachCount: SLOS.length - pageCount,
        cronFreshnessGroups: CRON_FRESHNESS.length,
        cronJobsUnderFreshnessWindow: cronJobCount,
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    },
  )
}
