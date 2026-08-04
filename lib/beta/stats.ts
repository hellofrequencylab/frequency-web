// Beta Command Center — STATS composition layer (Wave 2). This does NOT build a
// new metrics engine: it reuses the analytics we already ship and stitches them
// into one read for the Stats tab.
//
//   • Joins             — profiles.created_at, the real count of people who made
//                         an account. This replaced a waitlist-funnel prefix
//                         (waitlisted → confirmed → admitted) that went away with
//                         the waitlist itself; joins are the honest first stage of
//                         an open beta, and unlike the waitlist they are real.
//   • Activation        — lib/analytics/dashboard (getEngagementDashboard /
//                         computeFunnel), the member activation ledger. GLOBAL,
//                         not beta-scoped — labelled as such at the edge.
//   • Email engagement  — lib/studio/analytics (getEmailStats). Also GLOBAL.
//   • Funnel rollup     — lib/funnels/store (getFunnelRollup) if a Growth-OS
//                         beta funnel exists.
//
// THE HONESTY RULE: where a metric isn't instrumented yet, the value is `null`
// and the UI renders a labelled placeholder. We never fabricate a number.
// Server-only.

import { createAdminClient } from '@/lib/supabase/admin'
import { getEngagementDashboard, type FunnelStep } from '@/lib/analytics/dashboard'
import { getEmailStats } from '@/lib/studio/analytics'
import { listFunnels, getFunnelRollup, type Funnel, type FunnelRollupStage } from '@/lib/funnels/store'
import { weeklyBuckets } from '@/components/admin/spark-charts'

export interface BetaFunnelStep {
  key: string
  label: string
  /** Distinct people at this stage; null when the stage isn't instrumented yet. */
  value: number | null
  /** % lost from the previous instrumented stage in the same scope, or null. */
  dropPct: number | null
  scope: 'beta' | 'global'
  /** A one-line clarifier under the step: a scope caveat or an instrumentation TODO. */
  note?: string
}

export interface NorthStarMetric {
  key: string
  label: string
  /** Formatted display value, or null when not instrumented (UI shows a placeholder). */
  value: string | null
  detail: string
  instrumented: boolean
}

export interface BetaStatsModel {
  windowDays: number
  /** Real account counts: everyone who has joined, and how many did so in the window. */
  joins: { total: number; inWindow: number }
  /** The launch funnel: joined → activated → hosting → founding. */
  funnel: BetaFunnelStep[]
  /** The member activation funnel (all members, GLOBAL) — real, from the event ledger. */
  activation: FunnelStep[]
  /** Conversion from the first to the last activation step, 0..1 (null if no top-of-funnel). */
  activationConversion: number | null
  /** New members per trailing week, oldest → current (12 weeks). */
  weeklySignups: number[]
  northStar: NorthStarMetric[]
}

const ACTIVATION_WEEKS = 12

/** Every join timestamp, for the total + the weekly sparkline. `profiles` is the
 *  account record, so one row here is one person who got in. FAIL-SAFE to []. */
async function listJoinDates(): Promise<Date[]> {
  try {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(10000)
    return (data ?? [])
      .map((r) => (r.created_at ? new Date(r.created_at as string) : null))
      .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
  } catch (err) {
    console.error('[beta] listJoinDates failed:', err)
    return []
  }
}

/** One composed read for the Stats tab's funnel + activation + north-star blocks. */
export async function getBetaStats(windowDays = 30): Promise<BetaStatsModel> {
  const [joinDates, eng] = await Promise.all([listJoinDates(), getEngagementDashboard(windowDays)])
  const windowStart = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const joins = {
    total: joinDates.length,
    inWindow: joinDates.filter((d) => d.getTime() >= windowStart).length,
  }

  // GLOBAL activation signal: distinct members who reached the North-Star moment
  // (a verified practice) in the window. Not beta-scoped — we label it at the UI.
  const activatedGlobal = eng.activationFunnel.find((f) => f.eventType === 'practice.verified')?.actors ?? null
  const activationTop = eng.activationFunnel[0]?.actors ?? 0
  const activationEnd = eng.activationFunnel[eng.activationFunnel.length - 1]?.actors ?? 0
  const activationConversion = activationTop > 0 ? activationEnd / activationTop : null

  const funnel: BetaFunnelStep[] = [
    {
      key: 'joined',
      label: 'Joined',
      value: joins.total,
      dropPct: null,
      scope: 'beta',
      note: `Accounts created, all time. ${joins.inWindow.toLocaleString()} in the last ${windowDays} days.`,
    },
    {
      key: 'activated',
      label: 'Activated',
      value: activatedGlobal,
      dropPct: null,
      scope: 'global',
      note: `Verified a practice in the last ${windowDays} days. Across all members, not Beta-scoped yet.`,
    },
    {
      key: 'hosting',
      label: 'Hosting',
      value: null,
      dropPct: null,
      scope: 'beta',
      // TODO(instrument): Beta members who go on to host a Circle or Event.
      note: 'Not instrumented yet: Beta members hosting a Circle or Event.',
    },
    {
      key: 'founding',
      label: 'Founding',
      value: null,
      dropPct: null,
      scope: 'beta',
      // TODO(instrument): Beta members who convert to a founding membership.
      note: 'Not instrumented yet: Beta members converting to founding.',
    },
  ]

  const weeklySignups = weeklyBuckets(joinDates, ACTIVATION_WEEKS)

  const northStar: NorthStarMetric[] = [
    {
      key: 'solo_activation',
      label: 'Solo activation',
      value: null, // TODO(instrument): first Practice/Journey completed within 7 days of joining.
      detail: 'Share of new members whose first Practice or Journey lands within 7 days.',
      instrumented: false,
    },
    {
      key: 'graduation',
      label: 'Graduation rate',
      value: null, // TODO(instrument): solo members who go on to host a Circle or Event.
      detail: 'Share of solo members who go on to host a Circle or Event.',
      instrumented: false,
    },
    {
      key: 'self_formed_nuclei',
      label: 'Self-formed nuclei',
      value: null, // TODO(instrument): Circles/metros crossing ~10 active members on their own.
      detail: 'Circles or metros that cross about 10 active members without a nudge.',
      instrumented: false,
    },
    {
      key: 'feed_liveness',
      label: 'Global-feed liveness',
      value: null, // TODO(instrument): posts + reactions per active day on the global feed.
      detail: 'How live the global feed reads: posts and reactions per active day.',
      instrumented: false,
    },
  ]

  return {
    windowDays,
    joins,
    funnel,
    activation: eng.activationFunnel,
    activationConversion,
    weeklySignups,
    northStar,
  }
}

export interface BetaEmailEngagement {
  windowDays: number
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  /** delivered / (delivered + bounced), 0..1. */
  deliveryRate: number
  /** opened / delivered, 0..1. */
  openRate: number
  /** clicked / delivered, 0..1. */
  clickRate: number
  suppressed: number
}

/** Email engagement for the window. GLOBAL (not Beta-scoped) — the sending
 *  machinery does not tag events by campaign audience, so we surface the
 *  platform-wide numbers and label them clearly. */
export async function getBetaEmailEngagement(windowDays = 30): Promise<BetaEmailEngagement> {
  const s = await getEmailStats(windowDays)
  const t = s.byType
  const sent = t.sent ?? 0
  const delivered = t.delivered ?? 0
  const opened = t.opened ?? 0
  const clicked = t.clicked ?? 0
  const bounced = t.bounced ?? 0
  const complained = t.complained ?? 0
  return {
    windowDays,
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    complained,
    deliveryRate: s.deliveryRate,
    openRate: delivered > 0 ? opened / delivered : 0,
    clickRate: delivered > 0 ? clicked / delivered : 0,
    suppressed: s.suppressed,
  }
}

export interface BetaGrowthFunnel {
  funnel: Funnel
  stages: FunnelRollupStage[]
}

/** The Growth-OS beta funnel rollup, if one has been authored. Matches a funnel
 *  whose slug/name/template/persona names the Beta; null when none exists yet. */
export async function getBetaGrowthFunnel(windowDays = 30): Promise<BetaGrowthFunnel | null> {
  const funnels = await listFunnels()
  const beta = funnels.find(
    (f) =>
      /beta/i.test(f.slug) ||
      /beta/i.test(f.name) ||
      (f.templateKey ? /beta/i.test(f.templateKey) : false) ||
      (f.persona ? /beta/i.test(f.persona) : false),
  )
  if (!beta) return null
  const stages = await getFunnelRollup(beta.id, windowDays)
  return { funnel: beta, stages }
}
