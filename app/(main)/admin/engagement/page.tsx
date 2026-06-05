import { Users, Flame, TrendingUp } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { getEngagementDashboard, type FunnelStep } from '@/lib/analytics/dashboard'

// Janitor-only: the live engagement dashboard (ENGAGEMENT-MARKETING-ENGINE.md Phase B).
// WAM + activation, the activation funnel (where it jams), what's happening in the
// ledger, and the most-used pages + features. Reads first-party aggregates only.
export const dynamic = 'force-dynamic'

export default async function EngagementDashboardPage() {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })

  const d = await getEngagementDashboard(30)
  const pct = (n: number) => `${Math.round(n * 100)}%`

  return (
    <AdminPage
      title="Engagement"
      eyebrow="Insights"
      description={`Live first-party signal over the last ${d.windowDays} days.`}
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Weekly active" value={d.practice.wam} icon={Users} />
          <StatCard label="Verified (7d)" value={d.practice.verifiedThisWeek} icon={Flame} />
          <StatCard label="New (30d)" value={d.practice.newMembers} icon={TrendingUp} />
          <StatCard label="Activation" value={pct(d.practice.activationRate)} icon={TrendingUp} />
        </div>
      </AdminSection>

      {/* New-member activation — induction → Vera → first circle → first practice */}
      <AdminSection
        title="New-member activation"
        description="Distinct founders reaching each step of the journey. The drop tells you where to focus."
      >
        <FunnelView steps={d.activationFunnel} />
      </AdminSection>

      {/* Broad engagement funnel — where members drop off across the app */}
      <AdminSection
        title="Engagement funnel"
        description="Distinct members reaching each step. Drop-off fills in as page + feature events accrue."
      >
        <FunnelView steps={d.funnel} />
      </AdminSection>

      {/* What's happening — event volume by type */}
      <AdminSection title="Activity by type">
        {d.byType.length === 0 ? (
          <p className="text-sm text-muted">No events yet in this window.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-left text-xs text-subtle">
                <tr><th className="px-4 py-2 font-medium">Event</th><th className="px-4 py-2 text-right font-medium">Events</th><th className="px-4 py-2 text-right font-medium">Members</th></tr>
              </thead>
              <tbody>
                {d.byType.map((r) => (
                  <tr key={r.eventType} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs text-text">{r.eventType}</td>
                    <td className="px-4 py-2 text-right text-muted">{r.events}</td>
                    <td className="px-4 py-2 text-right text-muted">{r.actors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      <div className="grid gap-6 sm:grid-cols-2">
        <TopList title="Top pages" rows={d.topPages} empty="No page views yet." />
        <TopList title="Top features" rows={d.topFeatures} empty="No feature events yet." />
      </div>
    </AdminPage>
  )
}

function FunnelView({ steps }: { steps: FunnelStep[] }) {
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.eventType} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2.5">
          <span className="text-sm text-text">{s.step}</span>
          <span className="flex items-center gap-3">
            {s.dropPct !== null && s.dropPct > 0 && (
              <span className="text-xs font-semibold text-danger">−{s.dropPct}%</span>
            )}
            <span className="font-bold text-text">{s.actors}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function TopList({ title, rows, empty }: { title: string; rows: { value: string; n: number }[]; empty: string }) {
  return (
    <AdminSection title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.value} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
              <span className="truncate font-mono text-xs text-muted">{r.value}</span>
              <span className="shrink-0 font-bold text-text">{r.n}</span>
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  )
}
