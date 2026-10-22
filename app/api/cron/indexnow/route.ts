// LIVE-1137: once a day, tell IndexNow (Bing and the engines that share it) which public pages changed
// in the last day. Reads the same sitemap the crawlers read, so it can only ever name a URL the site
// already advertises as indexable; it never reaches around the public-page gates.
// Off until INDEXNOW_ENABLED is set (activation gate in docs/RUNBOOKS.md). One request, at most
// 10,000 URLs, so the cronBudget below is the URL cap.
import { NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { envFlag } from '@/lib/env/string'
import { recentSitemapUrls, submitIndexNow } from '@/lib/seo/indexnow'
import { log, briefError } from '@/lib/log'
import sitemap from '@/app/sitemap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Look back a little more than a day so a late run never leaves a gap between two runs. */
const WINDOW_MS = 26 * 3600_000

async function handler(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied

  // A skipped run is reported, not silent (every fail-safe needs a gate that notices it fired).
  if (!envFlag('INDEXNOW_ENABLED')) {
    log.info('cron.indexnow.skipped', { reason: 'INDEXNOW_ENABLED is off' })
    return NextResponse.json({ skipped: true, reason: 'INDEXNOW_ENABLED is off' })
  }

  const dry = new URL(request.url).searchParams.get('dry') === '1'
  try {
    const budget = cronBudget(10000)
    const entries = await sitemap()
    const recent = recentSitemapUrls(entries, Date.now() - WINDOW_MS)
    const urls = budget.take(recent)
    const summary = budget.summary(urls.length, recent.length - urls.length)
    if (urls.length === 0) return NextResponse.json({ submitted: 0, budget: summary })
    const status = dry ? 0 : await submitIndexNow(urls)
    const ok = dry || status === 200 || status === 202
    log[ok ? 'info' : 'error']('cron.indexnow', { submitted: urls.length, status, dry, ...summary })
    return NextResponse.json({ submitted: urls.length, status, dry, budget: summary }, { status: ok ? 200 : 502 })
  } catch (e) {
    log.error('cron.indexnow.failed', { error: briefError(e) })
    return NextResponse.json({ error: 'indexnow failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('indexnow', handler)
