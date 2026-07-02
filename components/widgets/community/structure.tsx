import { Users } from 'lucide-react'
import { DashArea, TileGrid, Tile, GraphTile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { TrendArea, weeklyBuckets, cumulative } from '@/components/admin/spark-charts'
import { createAdminClient } from '@/lib/supabase/admin'

// Community layout module (LP7): "Structure & people" — the shape of the live site and who's in it.
// Self-fetching RSC; the page owns the host + community-staff gate, so this never re-gates. Every
// count reads live and the whole load is fail-safe: any read error degrades to a calm zero row
// rather than a crash. Semantic tokens + the DashArea grammar only; no hex, no fixed-px type.

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const GROWTH_WEEKS = 12

interface StructureData {
  circles: number
  channels: number
  events: number
  hubs: number
  nexuses: number
  dispatches: number
  totalMembers: number
  inCircles: number
  team: number
  memberGrowth: number[]
}

const EMPTY: StructureData = {
  circles: 0, channels: 0, events: 0, hubs: 0, nexuses: 0, dispatches: 0,
  totalMembers: 0, inCircles: 0, team: 0, memberGrowth: [],
}

async function load(): Promise<StructureData> {
  try {
    const admin = createAdminClient()
    const nowMs = new Date().getTime()
    const nowIso = new Date(nowMs).toISOString()
    const since = new Date(nowMs - GROWTH_WEEKS * WEEK).toISOString()

    const [circles, channels, events, hubs, nexuses, dispatches, members, inCircles, team, newMembers] =
      await Promise.all([
        admin.from('circles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        admin.from('channels').select('id', { count: 'exact', head: true }),
        admin
          .from('events')
          .select('id', { count: 'exact', head: true })
          .gte('starts_at', nowIso)
          .eq('is_cancelled', false),
        admin.from('hubs').select('id', { count: 'exact', head: true }),
        admin.from('nexuses').select('id', { count: 'exact', head: true }),
        admin.from('dispatches').select('id', { count: 'exact', head: true }),
        // Members = real (non-system) person profiles, the canonical count (lib/analytics/members.ts).
        admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_system', false),
        admin.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        admin.from('team_members').select('id', { count: 'exact', head: true }),
        admin
          .from('profiles')
          .select('created_at')
          .eq('is_system', false)
          .gte('created_at', since),
      ])

    const totalMembers = members.count ?? 0
    const createdWeekly = weeklyBuckets(
      ((newMembers.data ?? []) as { created_at: string }[]).map((r) => new Date(r.created_at)),
      GROWTH_WEEKS,
    )
    const inWindow = createdWeekly.reduce((a, b) => a + b, 0)

    return {
      circles: circles.count ?? 0,
      channels: channels.count ?? 0,
      events: events.count ?? 0,
      hubs: hubs.count ?? 0,
      nexuses: nexuses.count ?? 0,
      dispatches: dispatches.count ?? 0,
      totalMembers,
      inCircles: inCircles.count ?? 0,
      team: team.count ?? 0,
      memberGrowth: cumulative(totalMembers - inWindow, createdWeekly),
    }
  } catch {
    return EMPTY
  }
}

export async function CommunityStructure() {
  const d = await load()

  return (
    <DashArea
      icon={Users}
      label="Structure & people"
      blurb="The shape of the live site and who's in it: circles, channels, events, the regions and broadcasts that reach them, the roster, and the staff team. Counts read live."
      href="/admin/circles"
      hrefLabel="Open Circles"
      footnote="Members are real (non-system) profiles; In circles counts active memberships. Growth is cumulative new members over the window."
    >
      <TileGrid>
        <Tile label="Network" span={3}>
          <MiniGrid>
            <MiniStat value={d.circles.toLocaleString()} label="Active circles" />
            <MiniStat value={d.channels.toLocaleString()} label="Channels" />
            <MiniStat value={d.events.toLocaleString()} label="Upcoming events" />
            <MiniStat value={d.hubs.toLocaleString()} label="Hubs" />
            <MiniStat value={d.nexuses.toLocaleString()} label="Nexuses" />
            <MiniStat value={d.dispatches.toLocaleString()} label="Broadcasts" />
          </MiniGrid>
        </Tile>
        <Tile label="People">
          <MiniGrid>
            <MiniStat value={d.totalMembers.toLocaleString()} label="Members" />
            <MiniStat value={d.inCircles.toLocaleString()} label="In circles" />
            <MiniStat value={d.team.toLocaleString()} label="Team members" />
            <MiniStat value={d.events.toLocaleString()} label="Upcoming events" />
          </MiniGrid>
        </Tile>
        <GraphTile
          label="Membership"
          value={d.totalMembers.toLocaleString()}
          caption={`${GROWTH_WEEKS} weeks · cumulative`}
          span={2}
        >
          <TrendArea points={d.memberGrowth} height={64} />
        </GraphTile>
      </TileGrid>
    </DashArea>
  )
}
