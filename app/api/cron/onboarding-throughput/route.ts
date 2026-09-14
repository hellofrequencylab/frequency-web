// LIVE-190 budget (ADR-1252): 1000 auth users per listUsers page; the walk stops on the clock, and a cut-off run says so with remaining=null because the auth table gives no count ahead of the walk.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Onboarding throughput cron (LIVE-311). Runs daily via Vercel Cron.
 *
 * THE GAP IT CLOSES. app/(main)/layout.tsx redirects any member `hasEffectivelyOnboarded()` returns
 * false for into /join on every request. ADR-1324 found nine accounts inside that loop for up to
 * eleven weeks, and the only instrument was a member texting. Nothing measured whether people got
 * THROUGH the gate, only whether it was closed. This is the reading.
 *
 * THE QUERY. Every auth user who signed in inside the last ACTIVE_WINDOW_DAYS, joined to their
 * profile, classified by lib/onboarding/throughput.ts: an account older than MIN_AGE_DAYS that is
 * still not admitted by the gate's OWN predicate (hasEffectivelyOnboarded over meta + economy, never
 * the raw flag alone) and that keeps signing in is STUCK. A non-zero count is a person locked out
 * right now.
 *
 * WHERE IT REPORTS. Two log lines under the cron's tags: `cron.onboarding_throughput.counts` on
 * every run (the four states, the active-user total, the budget summary) and
 * `onboarding.throughput.stuck` as a WARN, with the profile ids, only when the count is non-zero.
 * Profile ids, never emails or auth ids. The JSON response carries the same reading.
 *
 * ⚠️ A NON-ZERO COUNT ANSWERS 200, DELIBERATELY. The heartbeat wrapper fail-pings on a 5xx, and a
 * fail-ping says "the job died", which is not what happened: the job ran and found something. A
 * dead-man's switch that fires on a finding would teach everyone that the switch means "look at the
 * logs", and then the day the job actually dies nobody looks. The finding is loud on its own line.
 *
 * WHY THE SERVICE ROLE. `last_sign_in_at` lives on auth.users, which only the admin API reads, and
 * the gate's inputs (profiles.meta, the economy columns) are needed for every active member rather
 * than for the caller. There is no session: the caller is Vercel Cron. Read-only.
 *
 * Requires CRON_SECRET env var for security.
 */

import { NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasEffectivelyOnboarded } from '@/lib/onboarding/onboarded'
import {
  ACTIVE_WINDOW_DAYS,
  MIN_AGE_DAYS,
  readOnboardingThroughput,
  type OnboardingAccountRow,
} from '@/lib/onboarding/throughput'
import { log, briefError } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** PostgREST `in()` chunk so one filter never carries thousands of ids. */
const PROFILE_CHUNK = 200

interface ProfileRow {
  id: string
  auth_user_id: string | null
  created_at: string | null
  meta: unknown
  current_season_zaps: number | null
  lifetime_gems: number | null
}

async function handler(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied

  const budget = cronBudget(1000)
  const now = new Date()
  const windowStartMs = now.getTime() - ACTIVE_WINDOW_DAYS * 86_400_000

  try {
    const admin = createAdminClient()

    // 1) Every auth user with a sign-in inside the window. The admin API is paginated and gives no
    //    filter on last_sign_in_at, so the walk reads pages and keeps the active ones.
    const activeSignIns = new Map<string, string>()
    let pages = 0
    let usersScanned = 0
    let complete = false
    for (let page = 1; ; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: budget.items })
      if (error) throw error
      const users = data?.users ?? []
      pages += 1
      usersScanned += users.length
      for (const u of users) {
        const signedIn = u.last_sign_in_at ?? null
        if (signedIn && Date.parse(signedIn) >= windowStartMs) activeSignIns.set(u.id, signedIn)
      }
      if (users.length < budget.items) {
        complete = true
        break
      }
      if (budget.exhausted()) break
    }

    // 2) Their profiles, in chunks, with exactly the columns the gate reads.
    const authIds = [...activeSignIns.keys()]
    const rows: OnboardingAccountRow[] = []
    for (let i = 0; i < authIds.length; i += PROFILE_CHUNK) {
      const chunk = authIds.slice(i, i + PROFILE_CHUNK)
      const { data, error } = await admin
        .from('profiles')
        .select('id, auth_user_id, created_at, meta, current_season_zaps, lifetime_gems')
        .in('auth_user_id', chunk)
      if (error) throw error
      for (const p of (data ?? []) as ProfileRow[]) {
        rows.push({
          id: p.id,
          created_at: p.created_at,
          onboarding_completed: hasEffectivelyOnboarded({
            meta: p.meta,
            currentSeasonZaps: p.current_season_zaps,
            lifetimeGems: p.lifetime_gems,
          }),
          last_sign_in_at: (p.auth_user_id && activeSignIns.get(p.auth_user_id)) || null,
        })
      }
    }

    // 3) The reading.
    const reading = readOnboardingThroughput(rows, now)
    const summary = budget.summary(usersScanned, complete ? 0 : null)
    log.info('cron.onboarding_throughput.counts', {
      ...reading.counts,
      scanned: reading.scanned,
      active_users: activeSignIns.size,
      pages,
      complete,
      min_age_days: MIN_AGE_DAYS,
      active_window_days: ACTIVE_WINDOW_DAYS,
      ...summary,
    })
    if (reading.stuck.length > 0) {
      log.warn('onboarding.throughput.stuck', {
        count: reading.stuck.length,
        profile_ids: reading.stuck,
        min_age_days: MIN_AGE_DAYS,
        active_window_days: ACTIVE_WINDOW_DAYS,
      })
    }
    return NextResponse.json({
      ok: true,
      stuck: reading.stuck,
      counts: reading.counts,
      active_users: activeSignIns.size,
      complete,
      budget: summary,
    })
  } catch (e) {
    log.error('cron.onboarding_throughput.failed', { error: briefError(e) })
    return NextResponse.json({ error: 'onboarding throughput read failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('onboarding-throughput', handler)
