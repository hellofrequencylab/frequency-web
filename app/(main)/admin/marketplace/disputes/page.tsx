import { ShieldAlert } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { buttonClasses } from '@/components/ui/button'
import { listDisputes, disputeStatusCounts, type CommerceDispute } from '@/lib/commerce/disputes'
import { payoutsLive } from '@/lib/billing/connect'
import { reviewDisputeAction, resolveDisputeAction } from '../actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Disputes · Admin' }

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  reviewing: 'Reviewing',
  resolved_refund: 'Refunded',
  resolved_denied: 'Declined',
  cancelled: 'Withdrawn',
}

function DisputeRow({ d, payments }: { d: CommerceDispute; payments: boolean }) {
  const when = new Date(d.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary-strong">
          {STATUS_LABEL[d.status] ?? d.status}
        </span>
        <span className="text-xs text-subtle">{when}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-text">{d.reason}</p>
      {d.detail && <p className="mt-1 text-sm text-muted">{d.detail}</p>}
      <p className="mt-1 text-2xs text-subtle">order {d.orderId.slice(0, 8)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {d.status === 'open' && (
          <form action={reviewDisputeAction.bind(null, d.id)}>
            <button type="submit" className={buttonClasses('ghost', 'sm')}>
              Mark reviewing
            </button>
          </form>
        )}
        <form action={resolveDisputeAction.bind(null, d.id, 'refund')}>
          <button type="submit" className={buttonClasses('ghost', 'sm')}>
            {payments ? 'Approve refund' : 'Approve (record only)'}
          </button>
        </form>
        <form action={resolveDisputeAction.bind(null, d.id, 'deny')}>
          <button type="submit" className={buttonClasses('ghost', 'sm')}>
            Decline
          </button>
        </form>
      </div>
    </div>
  )
}

export default async function MarketplaceDisputesPage() {
  await requireAdmin('admin', { staff: 'platform' })
  const [disputes, counts, payments] = await Promise.all([
    listDisputes({ status: 'queue' }),
    disputeStatusCounts(),
    payoutsLive(),
  ])
  const open = (counts.open ?? 0) + (counts.reviewing ?? 0)
  const refunded = counts.resolved_refund ?? 0
  const declined = counts.resolved_denied ?? 0

  return (
    <AdminTemplate
      title="Disputes"
      eyebrow="Marketplace"
      description="Buyer-filed disputes and refund requests on orders. Approving a refund moves money only when payments are turned on; otherwise the decision is recorded."
      back={{ href: '/admin/marketplace', label: 'Marketplace' }}
      width="wide"
    >
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Open" value={open} icon={ShieldAlert} />
        <StatCard label="Refunded" value={refunded} />
        <StatCard label="Declined" value={declined} />
      </div>

      {!payments && (
        <div className="mb-6 rounded-xl border border-border bg-surface-elevated/50 p-4 text-sm text-muted">
          Payments are not turned on yet, so approving a refund records the decision without moving money. When
          payments go live, an approval runs the real refund.
        </div>
      )}

      <AdminSection title="Open queue" description={refunded + declined > 0 ? `${refunded + declined} already resolved.` : undefined}>
        {disputes.length === 0 ? (
          <EmptyState
            variant="cleared"
            icon={ShieldAlert}
            title="No open disputes"
            description="When a buyer opens a dispute on an order, it shows up here to resolve."
          />
        ) : (
          <div className="space-y-3">
            {disputes.map((d) => (
              <DisputeRow key={d.id} d={d} payments={payments} />
            ))}
          </div>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
