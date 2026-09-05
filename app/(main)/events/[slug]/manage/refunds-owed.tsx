import { AlertTriangle } from 'lucide-react'
import { countRefundsOwed } from '@/lib/events/cancellation'

// "N refunds still owed" (scan2 L6-04). A cancelled event's ticket refunds run as outbox jobs
// that retry on their own; this is the host's view of what has not landed yet. Renders nothing
// for a live event or once every ticket is refunded.
export async function RefundsOwedNotice({ eventId }: { eventId: string }) {
  const owed = await countRefundsOwed(eventId)
  if (owed === 0) return null
  return (
    <p
      role="status"
      className="inline-flex items-center gap-2 rounded-card border border-warning/50 bg-warning-bg/30 px-4 py-2.5 text-body-sm font-medium text-text"
    >
      <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
      {owed === 1 ? '1 refund still owed.' : `${owed} refunds still owed.`}{' '}
      <span className="font-normal text-muted">Refunds retry on their own. This number drops as each one lands.</span>
    </p>
  )
}
