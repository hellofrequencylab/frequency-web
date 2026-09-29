import { queueHealth } from '@/lib/queue/outbox'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { DrainQueueButton } from '@/app/(main)/admin/marketing/deliverability/requeue-button'

// Deliverability layout module (ADR-270/294): outbox queue health — the live send backlog, the
// dead-letter count and how long the oldest due job has waited. Self-fetching RSC; always renders (the
// numbers are the signal even at zero). The route is only reachable through the gated Deliverability
// page (marketing staff), which stays the authority.
//
// The same reading process-queue logs and pages on after every drain (lib/queue/outbox queueHealth,
// LIVE-547): this widget is where an operator who was paged comes to look, not the only place the
// numbers go.
//
// The manual drain sits here rather than with the dead-letter recovery below: this block is where an
// operator reads "N pending" and needs to make N move. The action re-gates server-side.
export async function MarketingDeliverabilityHealth() {
  const health = await queueHealth()

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
        <StatCard label="Pending in queue" value={health.pending.toLocaleString()} />
        <StatCard label="Dead-lettered" value={health.deadLettered.toLocaleString()} />
        <StatCard label="Oldest due job waiting" value={`${health.lagMin.toLocaleString()} min`} />
      </div>
    </AdminSection>
  )
}
