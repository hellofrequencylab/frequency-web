import { Telescope, Users, CircleDot, CalendarDays, Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { getMarketingIntel } from '@/lib/analytics/marketing-intel'

// Janitor-only: Vera Marketing Intelligence, Phase 1 (the data spine). Real-time,
// first-party growth / demand / geo / content / leader signal, straight from the
// deterministic mkt_* aggregates. Phase 2 (grounded forecasts + Vera's strategy
// narration) and the per-role seed prompts build on exactly this.
export const dynamic = 'force-dynamic'

function fmtDate(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No data yet.</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated/60 text-left">
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 font-semibold text-subtle ${i === 0 ? '' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border last:border-0">
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2 ${ci === 0 ? 'font-medium text-text' : 'text-right tabular-nums text-muted'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function MarketingIntelPage() {
  await requireAdmin('janitor')
  const intel = await getMarketingIntel(90, 30)

  const totals = intel.growth.reduce(
    (a, w) => ({
      members: a.members + w.new_members,
      circles: a.circles + w.new_circles,
      events: a.events + w.new_events,
    }),
    { members: 0, circles: 0, events: 0 },
  )

  return (
    <AdminPage
      title="Marketing intel"
      icon={Telescope}
      eyebrow="Insights"
      description={`Real-time growth, demand, and leader signal over the last ${intel.windowDays} days. This is the deterministic data spine; Vera's forecasts and strategy build on it next.`}
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={`New members (${intel.windowDays}d)`} value={totals.members} icon={Users} />
          <StatCard label="New circles" value={totals.circles} icon={CircleDot} />
          <StatCard label="New events" value={totals.events} icon={CalendarDays} />
          <StatCard label="Active leaders" value={intel.leaders.length} icon={Sparkles} />
        </div>
      </AdminSection>

      <AdminSection
        title="Interest demand vs supply"
        description="Where tune-ins and joins outrun the circles available. The gaps are what to seed next."
      >
        <Table
          head={['Channel', 'Interest', 'Tune-ins', 'Circles', 'Members']}
          rows={intel.demand.map((d) => [d.domain, d.interest, d.tune_ins, d.circles, d.members])}
        />
      </AdminSection>

      <AdminSection title="Where it is concentrated" description="Circles and members reached, by city.">
        <Table head={['City', 'Circles', 'Members']} rows={intel.geo.map((g) => [g.city, g.circles, g.members])} />
      </AdminSection>

      <AdminSection title="Growth by week">
        <Table
          head={['Week', 'Members', 'Circles', 'Events']}
          rows={intel.growth.map((w) => [fmtDate(w.week), w.new_members, w.new_circles, w.new_events])}
        />
      </AdminSection>

      <AdminSection title="Top content" description={`Highest-engagement posts in the last ${intel.contentDays} days.`}>
        <Table
          head={['When', 'Author', 'Score', 'Reactions', 'Comments', 'Excerpt']}
          rows={intel.content.map((c) => [
            fmtDate(c.created_at),
            c.author ?? 'Member',
            Math.round(c.engagement_score ?? 0),
            c.reactions ?? 0,
            c.comments ?? 0,
            c.excerpt ?? '',
          ])}
        />
      </AdminSection>

      <AdminSection
        title="Leader activity"
        description="Per Host, Guide, and Mentor: circle health and momentum. This is the input to each leader's seed prompts."
      >
        <Table
          head={['Leader', 'Role', 'Circles', 'Members', 'Last post', 'Last event', 'Zaps', 'Gems']}
          rows={intel.leaders.map((l) => [
            l.leader ?? 'Member',
            l.role,
            l.circles,
            l.members,
            fmtDate(l.last_post),
            fmtDate(l.last_event),
            l.season_zaps ?? 0,
            l.lifetime_gems ?? 0,
          ])}
        />
      </AdminSection>
    </AdminPage>
  )
}
