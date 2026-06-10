import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { getEngagementRead, type Severity } from '@/lib/analytics/engagement-read'

// Janitor-only: the Engagement Read (ENGAGEMENT-MARKETING-ENGINE.md Phase D). Reads
// the live signal and names what's working, what's jamming, and what to do — the
// product/retention twin of the Market Read. Synthesis is deterministic + grounded.
export const dynamic = 'force-dynamic'

const SEVERITY: Record<Severity, { label: string; cls: string; dot: string }> = {
  risk: { label: 'Risk', cls: 'text-danger', dot: '🔴' },
  watch: { label: 'Watch', cls: 'text-warning', dot: '⚠️' },
  good: { label: 'Good', cls: 'text-success', dot: '✅' },
}

export default async function InsightsPage() {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })

  const read = await getEngagementRead()

  return (
    <AdminPage
      title="Engagement Read"
      eyebrow="Insights"
      description="What’s working, what’s jamming, and what to do. Read off the live signal."
    >
      <AdminSection>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-text">{read.summary}</p>
        </div>
      </AdminSection>

      {read.insights.length === 0 ? (
        <p className="text-sm text-muted">No signal to read yet. Check back once members are active.</p>
      ) : (
        <div className="space-y-3">
          {read.insights.map((i) => {
            const s = SEVERITY[i.severity]
            return (
              <div key={i.id} className="rounded-2xl border border-border bg-surface p-4">
                <p className="flex items-center gap-2 font-bold text-text">
                  <span aria-hidden>{s.dot}</span>
                  {i.title}
                  <span className={`text-xs font-semibold uppercase tracking-wide ${s.cls}`}>{s.label}</span>
                </p>
                <p className="mt-1 text-sm text-muted">{i.finding}</p>
                <p className="mt-2 text-sm text-text">
                  <span className="font-semibold text-primary-strong">Do:</span> {i.recommendation}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </AdminPage>
  )
}
