import { Telescope, Users, CircleDot, CalendarDays, Sparkles, Compass } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { getMarketingIntel } from '@/lib/analytics/marketing-intel'
import { getAcquisitionRollup } from '@/lib/attribution/rollup'
import { runAcquisitionBackfill } from './actions'
import {
  projectGrowth,
  demandGaps,
  buildStrategy,
  type Momentum,
  type StrategyStatus,
} from '@/lib/analytics/marketing-forecast'

// Janitor-only: Vera Marketing Intelligence. Phase 1 (the data spine): real-time,
// first-party growth / demand / geo / content / leader signal, straight from the
// deterministic mkt_* aggregates. Phase 2 (shipped): grounded forecasts + strategy
// narration, the "Forecast & strategy" section below. Both stay deterministic and
// dark-safe (no model call); a Vera-narration layer can wrap them later.
export const dynamic = 'force-dynamic'

// Momentum + strategy-status glyphs follow the PRESENTATION legend (docs/PRESENTATION.md).
const MOMENTUM_LABEL: Record<Momentum, string> = {
  accelerating: '✅ accelerating',
  steady: '⏳ steady',
  slowing: '⚠️ slowing',
}
const STATUS_GLYPH: Record<StrategyStatus, string> = {
  now: '✅',
  watch: '⏳',
  hold: '⚠️',
}

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
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })
  const [intel, acq] = await Promise.all([getMarketingIntel(90, 30), getAcquisitionRollup()])

  const totals = intel.growth.reduce(
    (a, w) => ({
      members: a.members + w.new_members,
      circles: a.circles + w.new_circles,
      events: a.events + w.new_events,
    }),
    { members: 0, circles: 0, events: 0 },
  )

  // Phase 2: grounded forecasts + strategy. Deterministic, no model call.
  const forecast = projectGrowth(intel.growth, 4)
  const gaps = demandGaps(intel.demand)
  const strategy = buildStrategy(intel, forecast, gaps)

  return (
    <AdminPage
      title="Marketing intel"
      icon={Telescope}
      eyebrow="Insights"
      description={`Real-time growth, demand, and leader signal over the last ${intel.windowDays} days. The deterministic data spine, now with grounded forecasts and a prioritized strategy.`}
      width="wide"
    >
      <AdminSection
        title="Forecast & strategy"
        description={
          forecast.grounded
            ? 'Projected next 4 weeks from the weekly trend, then what to do about it. Deterministic, grounded only in the signal above.'
            : 'Not enough weekly history yet to project a trend. The strategy below still reflects current demand, geo, and leader signal.'
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Projected new members (4w)"
            value={forecast.new_members.projectedTotal}
            icon={Users}
            delta={{ label: MOMENTUM_LABEL[forecast.new_members.momentum], trend: 'flat' }}
          />
          <StatCard
            label="Projected new circles (4w)"
            value={forecast.new_circles.projectedTotal}
            icon={CircleDot}
            delta={{ label: MOMENTUM_LABEL[forecast.new_circles.momentum], trend: 'flat' }}
          />
          <StatCard
            label="Projected new events (4w)"
            value={forecast.new_events.projectedTotal}
            icon={CalendarDays}
            delta={{ label: MOMENTUM_LABEL[forecast.new_events.momentum], trend: 'flat' }}
          />
        </div>

        {strategy.length === 0 ? (
          <p className="text-sm text-muted">No clear move yet. Keep building the signal.</p>
        ) : (
          <ol className="space-y-2">
            {strategy.map((s, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-xl border border-border bg-surface-elevated/60 p-3"
              >
                <span className="shrink-0 text-base leading-6" aria-hidden>
                  {STATUS_GLYPH[s.status]}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{s.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </AdminSection>

      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={`New members (${intel.windowDays}d)`} value={totals.members} icon={Users} />
          <StatCard label="New circles" value={totals.circles} icon={CircleDot} />
          <StatCard label="New events" value={totals.events} icon={CalendarDays} />
          <StatCard label="Active leaders" value={intel.leaders.length} icon={Sparkles} />
        </div>
      </AdminSection>

      <AdminSection
        title="Acquisition sources"
        description={`How members first reached us (first-touch). ${acq.attributed} of ${acq.totalMembers} attributed — ${Math.round(acq.coverage * 100)}% coverage.`}
        actions={
          <form action={runAcquisitionBackfill}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <Compass className="h-3.5 w-3.5" /> Backfill from referrals + beta
            </button>
          </form>
        }
      >
        {acq.rows.length === 0 ? (
          <p className="text-sm text-muted">
            No attributed members yet. New signups are tagged automatically; “Backfill” infers a
            source for existing members from referrals and their beta answers.
          </p>
        ) : (
          <Table
            head={['Channel', 'Members', 'New (30d)', 'Share']}
            rows={acq.rows.map((r) => [r.label, r.members, r.last30, `${Math.round(r.share * 100)}%`])}
          />
        )}
      </AdminSection>

      <AdminSection
        title="Interest demand vs supply"
        description="Where tune-ins and joins outrun the circles available. The gaps are what to seed next."
      >
        <Table
          head={['Pillar', 'Interest', 'Tune-ins', 'Circles', 'Members']}
          rows={intel.demand.map((d) => [d.pillar, d.interest, d.tune_ins, d.circles, d.members])}
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
