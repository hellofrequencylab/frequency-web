'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { rsvpToTier } from '@/lib/spaces/tickets-actions'
import { recordSpaceCtaClickAction } from '@/lib/spaces/analytics-actions'

// RESERVE BUTTON (client). Calls the rsvpToTier server action for one Event Space tier. The server
// re-validates the tier (real, active, 'rsvp' kind, this Space), checks capacity, and that the caller
// does not already hold this spot, so this button is convenience, not the gate. On success it
// refreshes so the surface flips to the "you have a spot" state.
//
// This is the role's primary CTA, so a click fires a `space.cta_click` event (Epic 1.11)
// fire-and-forget before the RSVP action runs, so operators see CTA performance for the deep engine
// just as the placeholder session list did (the recorder is itself fail-safe and never blocks).
//
// HONESTY (CONTENT-VOICE skeptic test): the button says "Reserve a spot" (not "Buy" / "Pay"); v1 takes
// no charge. No narrated feelings, no em/en dashes (CONTENT-VOICE §10).

export function TicketReserveButton({ spaceId, tierId }: { spaceId: string; tierId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function reserve() {
    if (!tierId) return
    setError(null)
    // Fire-and-forget CTA telemetry (Epic 1.11): never awaited, never blocks the RSVP.
    void recordSpaceCtaClickAction(spaceId)
    start(async () => {
      const result = await rsvpToTier(spaceId, tierId)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div>
      <Button
        type="button"
        onClick={reserve}
        disabled={pending || !tierId}
        className="w-full justify-center"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reserving
          </>
        ) : (
          'Reserve a spot'
        )}
      </Button>
      {error && (
        <p className="mt-2 text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
