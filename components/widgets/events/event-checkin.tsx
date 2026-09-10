import { QrCode } from 'lucide-react'
import { getEventContext } from '@/lib/events/active-event'
import { readEventSpecialInstructions, SPECIAL_INSTRUCTIONS_LABEL } from '@/lib/events/special-instructions'

// The movable CHECK-IN block (the `event-checkin` layout module, paired with the Engage editor).
// A zero-prop self-fetching RSC reading the request-scoped event context (lib/events/active-event
// .ts). It self-gates to the check-in window — the event has started but not ended — so it never
// leaves an empty slot before or after. DAWN tokens only; container-query friendly.
//
// THE HOST'S DOOR NOTE PRINTS HERE (ADR-1306). `events.details.specialInstructions` is the parking,
// the gate code, what to bring, the accessibility line. The create form has asked for it since the
// first event form and NOTHING read it back: it was collected, stored, and shown to nobody. This is
// the moment it is worth reading — the doors are open and someone is standing outside — so it rides
// on the block that is already gated to exactly that window rather than becoming a tenth block that
// self-hides for the other 99% of an event's life.

export const EventCheckin = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  if (ctx.event.is_cancelled) return null
  // One flag carries both halves of "is there a door right now" (lib/events/active-event.ts): the
  // host's switch, which a planning session or a private working block turns off, and the time
  // window, which opens at the start and shuts four hours past the end.
  if (!ctx.checkInOpen) return null

  const instructions = readEventSpecialInstructions(ctx.posterDetails)

  return (
    <div className="@container rounded-2xl border border-primary/30 bg-primary-bg p-4">
      <h3 className="mb-1.5 flex items-center gap-2 text-body-sm font-bold text-text">
        <QrCode className="h-4 w-4 shrink-0 text-primary-strong" />
        Check-in is open
      </h3>
      <p className="text-body-sm text-muted">
        This gathering is happening now. Guests can check in to mark that they showed up.
      </p>

      {instructions && (
        <div className="mt-3 border-t border-primary/20 pt-3">
          {/* `text-meta`, not `text-2xs`: text-subtle at the two smallest sizes is sub-AA by
              construction, and the adoption ratchet counts that pairing (UX-MATURITY Lift 3). */}
          <p className="text-meta font-semibold uppercase tracking-wide text-subtle">{SPECIAL_INSTRUCTIONS_LABEL}</p>
          {/* The host typed this as lines, so it keeps them. `whitespace-pre-line` collapses the
              runs of spaces a paste brings and honours the newlines, which is what a door note is. */}
          <p className="mt-1 whitespace-pre-line text-body-sm text-text">{instructions}</p>
        </div>
      )}
    </div>
  )
}
