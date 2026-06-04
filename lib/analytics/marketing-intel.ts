// Vera Marketing Intelligence · Phase 1 read layer. Reads the deterministic data
// spine (the mkt_* RPCs) via the admin client — the grounded facts that Phase 2's
// forecasts + Vera strategy narration and the per-role seed prompts build on.
// Server-only; admin-gated at the page. The findings stay deterministic; the model
// only ever narrates them (same convention as lib/analytics/engagement-read.ts).

import { createAdminClient } from '@/lib/supabase/admin'

export interface GrowthWeek {
  week: string
  new_members: number
  new_circles: number
  new_events: number
}
export interface InterestDemand {
  domain: string
  interest: string
  interest_slug: string
  tune_ins: number
  circles: number
  members: number
}
export interface GeoRow {
  city: string
  circles: number
  members: number
}
export interface ContentRow {
  post_id: string
  created_at: string
  author: string | null
  engagement_score: number | null
  reactions: number | null
  comments: number | null
  excerpt: string | null
}
export interface LeaderRow {
  profile_id: string
  leader: string | null
  role: string
  circles: number
  members: number
  last_post: string | null
  last_event: string | null
  season_zaps: number | null
  lifetime_gems: number | null
}

export interface MarketingIntel {
  windowDays: number
  contentDays: number
  growth: GrowthWeek[]
  demand: InterestDemand[]
  geo: GeoRow[]
  content: ContentRow[]
  leaders: LeaderRow[]
}

export async function getMarketingIntel(windowDays = 90, contentDays = 30): Promise<MarketingIntel> {
  const db = createAdminClient()
  const [growth, demand, geo, content, leaders] = await Promise.all([
    db.rpc('mkt_growth', { _days: windowDays }),
    db.rpc('mkt_interest_demand'),
    db.rpc('mkt_geo'),
    db.rpc('mkt_content_performance', { _days: contentDays, _limit: 20 }),
    db.rpc('mkt_leader_activity'),
  ])

  return {
    windowDays,
    contentDays,
    growth: (growth.data ?? []) as GrowthWeek[],
    demand: (demand.data ?? []) as InterestDemand[],
    geo: (geo.data ?? []) as GeoRow[],
    content: (content.data ?? []) as ContentRow[],
    leaders: (leaders.data ?? []) as LeaderRow[],
  }
}
