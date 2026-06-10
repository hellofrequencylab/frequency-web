// Vera Marketing Intelligence · Phase 2 forecast + strategy layer. Pure,
// deterministic functions over the Phase 1 MarketingIntel spine: a least-squares
// linear projection of growth, demand-vs-supply gap ranking, momentum + stale-leader
// reads, and a prioritized strategy. No model call: the findings stay deterministic
// and dark-safe; a Vera-narration layer can wrap these later (same doctrine as
// lib/analytics/marketing-intel.ts). House style: no em dashes in any returned copy.

import type {
  MarketingIntel,
  GrowthWeek,
  InterestDemand,
  GeoRow,
  LeaderRow,
} from './marketing-intel'

export type Momentum = 'accelerating' | 'steady' | 'slowing'
export type GrowthMetric = 'new_members' | 'new_circles' | 'new_events'

export interface MetricProjection {
  /** Projected total across the next `weeksAhead` weeks (clamped at 0). */
  projectedTotal: number
  /** Projected value for the next single week (clamped at 0). */
  nextWeek: number
  momentum: Momentum
}

export interface GrowthForecast {
  weeksAhead: number
  /** True only when there were >= 2 data points to fit a trend. */
  grounded: boolean
  new_members: MetricProjection
  new_circles: MetricProjection
  new_events: MetricProjection
}

export interface DemandGap {
  pillar: string
  interest: string
  interest_slug: string
  tune_ins: number
  circles: number
  members: number
  gapScore: number
  reason: string
}

export interface StaleLeader {
  profile_id: string
  leader: string | null
  role: string
  circles: number
  members: number
  last_post: string | null
  last_event: string | null
  /** Most recent of last_post / last_event as an epoch ms, or 0 if never. */
  lastActiveMs: number
}

export type StrategyStatus = 'now' | 'watch' | 'hold'
export interface StrategyItem {
  status: StrategyStatus
  title: string
  detail: string
}

const FLAT: MetricProjection = { projectedTotal: 0, nextWeek: 0, momentum: 'steady' }

/** Least-squares slope + intercept for points (0..n-1, ys). */
function linfit(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length
  const meanX = (n - 1) / 2
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (ys[i] - meanY)
    den += (i - meanX) * (i - meanX)
  }
  const slope = den === 0 ? 0 : num / den
  return { slope, intercept: meanY - slope * meanX }
}

/** accelerating / steady / slowing by comparing the recent half mean vs the
 *  earlier half mean of the series. Needs >= 2 points; ties are 'steady'. */
function momentumOf(ys: number[]): Momentum {
  if (ys.length < 2) return 'steady'
  const mid = Math.floor(ys.length / 2)
  const earlier = ys.slice(0, mid)
  const recent = ys.slice(ys.length - mid)
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const e = avg(earlier)
  const r = avg(recent)
  // Relative threshold so noise doesn't read as a trend (10% of earlier base).
  const threshold = Math.max(1, Math.abs(e) * 0.1)
  if (r - e > threshold) return 'accelerating'
  if (e - r > threshold) return 'slowing'
  return 'steady'
}

function projectMetric(ys: number[], weeksAhead: number): MetricProjection {
  if (ys.length < 2) return { ...FLAT }
  const { slope, intercept } = linfit(ys)
  const n = ys.length
  let total = 0
  let nextWeek = 0
  for (let k = 1; k <= weeksAhead; k++) {
    const v = Math.max(0, intercept + slope * (n - 1 + k))
    if (k === 1) nextWeek = Math.round(v)
    total += v
  }
  return {
    projectedTotal: Math.round(total),
    nextWeek,
    momentum: momentumOf(ys),
  }
}

/**
 * Project the next `weeksAhead` weeks of new members / circles / events from the
 * weekly growth series via a least-squares linear trend. Guards against < 2 data
 * points (returns a flat, ungrounded forecast). Projections are clamped at 0.
 */
export function projectGrowth(growth: GrowthWeek[], weeksAhead = 4): GrowthForecast {
  const grounded = growth.length >= 2
  const metric = (key: GrowthMetric) =>
    projectMetric(
      growth.map((w) => w[key] ?? 0),
      weeksAhead,
    )
  return {
    weeksAhead,
    grounded,
    new_members: metric('new_members'),
    new_circles: metric('new_circles'),
    new_events: metric('new_events'),
  }
}

/**
 * Rank interests where demand outruns supply. A channel with tune-ins or members
 * but zero circles is the highest-priority gap (uncaptured demand). Otherwise the
 * gap grows with demand per existing circle. Returns the worst gaps first.
 */
export function demandGaps(demand: InterestDemand[], limit = 6): DemandGap[] {
  const gaps: DemandGap[] = demand.map((d) => {
    const tune = d.tune_ins ?? 0
    const members = d.members ?? 0
    const circles = d.circles ?? 0
    const demandUnits = tune + members
    let gapScore: number
    let reason: string
    if (circles === 0 && demandUnits > 0) {
      // Uncaptured demand: no circle exists yet. Highest priority.
      gapScore = 1000 + demandUnits
      reason = `${tune} tune ins, ${members} members, no circle yet`
    } else if (circles === 0) {
      gapScore = 0
      reason = 'no demand yet'
    } else {
      // Demand per circle: how stretched the existing supply is.
      gapScore = Math.round((demandUnits / circles) * 10) / 10
      reason = `${demandUnits} interested across ${circles} circle${circles === 1 ? '' : 's'}`
    }
    return {
      pillar: d.pillar,
      interest: d.interest,
      interest_slug: d.interest_slug,
      tune_ins: tune,
      circles,
      members,
      gapScore,
      reason,
    }
  })
  return gaps
    .filter((g) => g.gapScore > 0)
    .sort((a, b) => b.gapScore - a.gapScore)
    .slice(0, limit)
}

/** The city with the most reach (members, then circles). Optional growth is
 *  reserved for future weighting; reach is the deterministic signal today. */
export function topMomentumCity(geo: GeoRow[], growth?: GrowthWeek[]): GeoRow | null {
  void growth // reserved for future trend weighting
  if (geo.length === 0) return null
  return [...geo].sort(
    (a, b) => (b.members ?? 0) - (a.members ?? 0) || (b.circles ?? 0) - (a.circles ?? 0),
  )[0]
}

function lastActiveMs(l: LeaderRow): number {
  const post = l.last_post ? Date.parse(l.last_post) : 0
  const event = l.last_event ? Date.parse(l.last_event) : 0
  return Math.max(Number.isNaN(post) ? 0 : post, Number.isNaN(event) ? 0 : event)
}

/** Leaders with the oldest activity (the ones to nudge), oldest first. Leaders
 *  who run >= 1 circle are prioritized; never-active leaders sort to the top. */
export function staleLeaders(leaders: LeaderRow[], limit = 5): StaleLeader[] {
  return leaders
    .filter((l) => (l.circles ?? 0) > 0)
    .map((l) => ({
      profile_id: l.profile_id,
      leader: l.leader,
      role: l.role,
      circles: l.circles,
      members: l.members,
      last_post: l.last_post,
      last_event: l.last_event,
      lastActiveMs: lastActiveMs(l),
    }))
    .sort((a, b) => a.lastActiveMs - b.lastActiveMs)
    .slice(0, limit)
}

/**
 * Build a prioritized, presentation-ready strategy from the grounded findings
 * only. Status maps to the PRESENTATION legend in the UI (now/watch/hold). All
 * copy avoids em dashes per house style.
 */
export function buildStrategy(
  intel: MarketingIntel,
  forecast: GrowthForecast,
  gaps: DemandGap[],
): StrategyItem[] {
  const items: StrategyItem[] = []

  // 1. Top demand gaps -> seed circles now.
  for (const g of gaps.slice(0, 2)) {
    const seed = g.circles === 0
    items.push({
      status: 'now',
      title: seed ? `Seed a circle for ${g.interest}` : `Add supply for ${g.interest}`,
      detail: seed
        ? `Demand exists with no circle to catch it: ${g.reason}. Stand one up and route the interested in.`
        : `Supply is stretched: ${g.reason}. Spin up another circle or split the busiest one.`,
    })
  }

  // 2. Hot city -> concentrate.
  const city = topMomentumCity(intel.geo, intel.growth)
  if (city && (city.members ?? 0) > 0) {
    items.push({
      status: 'now',
      title: `Concentrate on ${city.city}`,
      detail: `${city.city} leads on reach with ${city.members} members across ${city.circles} circle${city.circles === 1 ? '' : 's'}. Focus events and outreach where the density already is.`,
    })
  }

  // 3. Slowing momentum -> re-engage (watch).
  const slowing: GrowthMetric[] = (
    ['new_members', 'new_circles', 'new_events'] as GrowthMetric[]
  ).filter((m) => forecast.grounded && forecast[m].momentum === 'slowing')
  if (slowing.length > 0) {
    const label = slowing.map((m) => m.replace('new_', '')).join(', ')
    items.push({
      status: 'watch',
      title: `Re-engage to lift ${label}`,
      detail: `Recent weeks are cooling on ${label}. Run a re-activation push before the trend sets.`,
    })
  }

  // 4. Stale leaders -> nudge (watch).
  const stale = staleLeaders(intel.leaders, 3)
  if (stale.length > 0) {
    const names = stale.map((s) => s.leader ?? 'a leader').slice(0, 3).join(', ')
    items.push({
      status: 'watch',
      title: `Nudge ${stale.length} quiet leader${stale.length === 1 ? '' : 's'}`,
      detail: `Oldest to act: ${names}. A friendly prompt to post or schedule keeps their circles warm.`,
    })
  }

  // 5. Accelerating across the board with no open gaps -> hold the line.
  const allAccel =
    forecast.grounded &&
    forecast.new_members.momentum === 'accelerating' &&
    forecast.new_circles.momentum === 'accelerating'
  if (allAccel && gaps.length === 0) {
    items.push({
      status: 'hold',
      title: 'Hold course, growth is compounding',
      detail: 'Members and circles are both accelerating with no open demand gap. Protect the formula and avoid over steering.',
    })
  }

  return items
}
