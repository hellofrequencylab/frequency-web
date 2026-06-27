import { getEventContext } from '@/lib/events/active-event'
import { WarmProof } from '@/components/events/warm-proof'

// The movable WARM-PROOF block (the `event-warm-proof` layout module): the small avatar pile + the
// single warm line of real attendance numbers an operator places anywhere on the event page. A
// zero-prop self-fetching RSC that reads the request-scoped event context (lib/events/active-event.ts)
// — the page computes the counts once and stamps them, so there's no re-fetch or prop-drilling.
//
// Self-gate: hidden on a cancelled event (matching the page's old aside, which only rendered warm
// proof when not cancelled), so the block never leaves an empty slot there.
export const EventWarmProof = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  if (ctx.event.is_cancelled) return null
  const { warmProof } = ctx

  return (
    <WarmProof
      going={warmProof.going}
      fromYourCircles={warmProof.fromYourCircles}
      maybe={warmProof.maybe}
      guests={warmProof.guests}
      faces={warmProof.faces}
      nearFull={warmProof.nearFull}
      spotsLeft={warmProof.spotsLeft}
    />
  )
}
