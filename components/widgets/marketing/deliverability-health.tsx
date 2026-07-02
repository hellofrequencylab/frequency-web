import { countPending, countDeadLettered } from '@/lib/queue/outbox'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { FreshnessNote } from '@/components/admin/freshness-note'

// Deliverability layout module (ADR-270/294): outbox queue health — the live send backlog and the
// dead-letter count. Self-fetching RSC; always renders (the counts are the signal even at zero). The
// route is only reachable through the gated Deliverability page (marketing staff), which stays the
// authority.
export async function MarketingDeliverabilityHealth() {
  const [pending, dead] = await Promise.all([countPending(), countDeadLettered()])

  return (
    <AdminSection title="Queue health" actions={<FreshnessNote at={new Date()} />}>
      <div className="grid grid-cols-2 gap-3.5 @2xl:grid-cols-4">
        <StatCard label="Pending in queue" value={pending.toLocaleString()} />
        <StatCard label="Dead-lettered" value={dead.toLocaleString()} />
      </div>
    </AdminSection>
  )
}
