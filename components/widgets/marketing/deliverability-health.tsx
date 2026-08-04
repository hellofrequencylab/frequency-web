import { countPending, countDeadLettered } from '@/lib/queue/outbox'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { DrainQueueButton } from '@/app/(main)/admin/marketing/deliverability/requeue-button'

// Deliverability layout module (ADR-270/294): outbox queue health — the live send backlog and the
// dead-letter count. Self-fetching RSC; always renders (the counts are the signal even at zero). The
// route is only reachable through the gated Deliverability page (marketing staff), which stays the
// authority.
//
// The manual drain sits here rather than with the dead-letter recovery below: this block is where an
// operator reads "N pending" and needs to make N move. The action re-gates server-side.
export async function MarketingDeliverabilityHealth() {
  const [pending, dead] = await Promise.all([countPending(), countDeadLettered()])

  return (
    <AdminSection
      title="Queue health"
      actions={
        <span className="flex items-center gap-3">
          <DrainQueueButton />
          <FreshnessNote at={new Date()} />
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3.5 @2xl:grid-cols-4">
        <StatCard label="Pending in queue" value={pending.toLocaleString()} />
        <StatCard label="Dead-lettered" value={dead.toLocaleString()} />
      </div>
    </AdminSection>
  )
}
