import { Flag } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { listMarketplaceReports, reportStatusCounts, type MarketplaceReport } from '@/lib/commerce/reports'
import { moderateReportAction } from '../actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Reports · Admin' }

const KIND_LABEL: Record<string, string> = { listing: 'Listing', product: 'Product', order: 'Order', profile: 'Profile' }

function ReportRow({ r }: { r: MarketplaceReport }) {
  const when = new Date(r.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary-strong">
          {KIND_LABEL[r.targetKind] ?? r.targetKind}
        </span>
        <span className="text-xs text-subtle">{when} · {r.status}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-text">{r.reason}</p>
      {r.detail && <p className="mt-1 text-sm text-muted">{r.detail}</p>}
      <p className="mt-1 text-2xs text-subtle">target {r.targetKind}:{r.targetId.slice(0, 8)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {r.status !== 'reviewing' && (
          <form action={moderateReportAction.bind(null, r.id, 'reviewing')}>
            <button type="submit" className={buttonClasses('ghost', 'sm')}>Mark reviewing</button>
          </form>
        )}
        <form action={moderateReportAction.bind(null, r.id, 'actioned')}>
          <button type="submit" className={buttonClasses('ghost', 'sm')}>Actioned</button>
        </form>
        <form action={moderateReportAction.bind(null, r.id, 'dismissed')}>
          <button type="submit" className={buttonClasses('ghost', 'sm')}>Dismiss</button>
        </form>
      </div>
    </div>
  )
}

export default async function MarketplaceReportsPage() {
  await requireAdmin('admin', { staff: 'platform' })
  const [reports, counts] = await Promise.all([
    listMarketplaceReports({ status: 'queue' }),
    reportStatusCounts(),
  ])
  const resolved = (counts.actioned ?? 0) + (counts.dismissed ?? 0)

  return (
    <AdminTemplate
      title="Reports"
      eyebrow="Marketplace"
      description="Member-filed reports across listings, products, and profiles. Acting on one resolves it; nothing is deleted."
      back={{ href: '/admin/marketplace', label: 'Marketplace' }}
      width="wide"
    >
      <AdminSection
        title="Open queue"
        description={resolved > 0 ? `${resolved} already resolved.` : undefined}
      >
        {reports.length === 0 ? (
          <EmptyState
            variant="cleared"
            icon={Flag}
            title="The queue is clear"
            description="No open marketplace reports. New ones show up here for review."
          />
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <ReportRow key={r.id} r={r} />
            ))}
          </div>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
