import { QrCode } from 'lucide-react'
import { getEventContext } from '@/lib/events/active-event'

// The movable CHECK-IN block (the `event-checkin` layout module, paired with the Engage editor).
// A zero-prop self-fetching RSC reading the request-scoped event context (lib/events/active-event
// .ts). It self-gates to the check-in window — the event has started but not ended — so it never
// leaves an empty slot before or after. DAWN tokens only; container-query friendly.

export const EventCheckin = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  if (ctx.event.is_cancelled) return null
  // Check-in is only meaningful while the event is actually happening.
  if (!ctx.isPast || ctx.hasEnded) return null

  return (
    <div className="@container rounded-2xl border border-primary-border bg-primary-bg p-4">
      <h3 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-text">
        <QrCode className="h-4 w-4 shrink-0 text-primary-strong" />
        Check-in is open
      </h3>
      <p className="text-sm text-muted">
        This gathering is happening now. Guests can check in to mark that they showed up.
      </p>
    </div>
  )
}
