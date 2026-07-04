import { TrendingUp } from 'lucide-react'
import { DashArea, TileGrid, Tile, GraphTile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { TrendArea, RingGauge, weeklyBuckets, cumulative } from '@/components/admin/spark-charts'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { getEngagementDashboard } from '@/lib/analytics/dashboard'

// Growth layout module (LP7): "Funnel & activation" — new members joining, and how many reach the
// North-Star moment (a verified practice) within their first week. Self-fetching RSC; the page owns
// the marketing-staff gate, so this never re-gates. Fail-safe: any read error degrades to a calm zero
// row rather than a crash. The funnel shows where it jams. Semantic tokens + DashArea grammar only.

const WEEK = 7 * 24 * 60 * 60 * 1000
const GROWTH_WEEKS = 12

type FunnelStep = Awaited<ReturnType<typeof getEngagementDashboard>>['activationFunnel'][number]

interface FunnelData {
  totalProfiles: number
  growthSeries: number[]
  newMembers30d: number
  activationRate: number
  activated: number
  newMembers: number
  activationPct: number
  steps: FunnelStep[]
  campaigns: number
  segments: number
  sequences: number
  contacts: number
}

const EMPTY: FunnelData = {
  totalProfiles: 0, growthSeries: [], newMembers30d: 0, activationRate: 0,
  activated: 0, newMembers: 0, activationPct: 0, steps: [],
  campaigns: 0, segments: 0, sequences: 0, contacts: 0,
}

async function load(): Promise<FunnelData> {
  try {
    const admin = createAdminClient()
    const now = new Date()
    const growthStart = new Date(now.getTime() - GROWTH_WEEKS * WEEK).toISOString()

    const [joinsRes, totalProfilesRes, practice, dash, campaignsCount, segmentsCount, sequencesCount, contactsCount] =
      await Promise.all([
        admin.from('profiles').select('created_at').gte('created_at', growthStart),
        admin.from('profiles').select('id', { count: 'exact', head: true }),
        getPracticeMetrics(),
        getEngagementDashboard(),
        admin.from('campaigns').select('id', { count: 'exact', head: true }),
        admin.from('segments').select('id', { count: 'exact', head: true }),
        admin.from('nurture_sequences').select('id', { count: 'exact', head: true }).eq('enabled', true),
        admin.from('contacts').select('id', { count: 'exact', head: true }),
      ])

    const totalProfiles = totalProfilesRes.count ?? 0
    const joinDates = (joinsRes.data ?? []).map((r) => new Date(r.created_at as string))
    const weeklyJoins = weeklyBuckets(joinDates, GROWTH_WEEKS, now)
    const joinedInWindow = weeklyJoins.reduce((a, b) => a + b, 0)

    return {
      totalProfiles,
      growthSeries: cumulative(totalProfiles - joinedInWindow, weeklyJoins),
      newMembers30d: weeklyJoins.slice(-4).reduce((a, b) => a + b, 0),
      activationRate: practice.activationRate,
      activated: practice.activated,
      newMembers: practice.newMembers,
      activationPct: Math.round(practice.activationRate * 100),
      steps: dash.activationFunnel,
      campaigns: campaignsCount.count ?? 0,
      segments: segmentsCount.count ?? 0,
      sequences: sequencesCount.count ?? 0,
      contacts: contactsCount.count ?? 0,
    }
  } catch {
    return EMPTY
  }
}

export async function GrowthFunnel() {
  const d = await load()
  const top = d.steps[0]?.actors ?? 0

  return (
    <DashArea
      icon={TrendingUp}
      label="Funnel & activation"
      blurb="New members joining, and how many reach the North-Star moment (a verified practice) within their first week. The funnel shows where it jams."
      href="/admin/insights?tab=engagement"
      hrefLabel="Open Engagement"
      footnote={<FreshnessNote at={new Date()} label="Computed" />}
    >
      <TileGrid>
        <GraphTile
          label="Member growth"
          value={d.totalProfiles.toLocaleString()}
          caption={`${GROWTH_WEEKS} weeks${d.newMembers30d > 0 ? ` · +${d.newMembers30d} this month` : ''}`}
        >
          <TrendArea points={d.growthSeries} height={64} />
        </GraphTile>
        <div className="col-span-1 flex items-center rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <RingGauge
            pct={d.activationRate}
            label="Activation · 7d"
            sub={`${d.activated} of ${d.newMembers} new activated`}
          />
        </div>
        <Tile label="Campaigns & audiences">
          <MiniGrid>
            <MiniStat value={d.campaigns.toLocaleString()} label="Campaigns" />
            <MiniStat value={d.segments.toLocaleString()} label="Segments" />
            <MiniStat value={d.sequences.toLocaleString()} label="Active sequences" />
            <MiniStat value={d.contacts.toLocaleString()} label="Contacts" />
          </MiniGrid>
        </Tile>
        <Tile
          label="Activation funnel"
          span={3}
          caption="Last 30 days · distinct founders reaching each step, as a share of the first."
        >
          {d.steps.length === 0 ? (
            <p className="text-sm text-muted">No funnel signal yet.</p>
          ) : (
            <div className="space-y-2.5">
              {d.steps.map((s) => {
                const width = top > 0 ? Math.round((s.actors / top) * 100) : 0
                return (
                  <div key={s.step}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-text">{s.step}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {s.actors.toLocaleString()}
                        {s.dropPct !== null && s.dropPct > 0 && (
                          <span className="ml-1.5 text-2xs text-danger">−{s.dropPct}%</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="mt-3 text-xs text-subtle">Activation is {d.activationPct}% over the last 7 days.</p>
        </Tile>
      </TileGrid>
    </DashArea>
  )
}
