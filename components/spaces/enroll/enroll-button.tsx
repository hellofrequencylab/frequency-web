'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { enrollInProgram } from '@/lib/spaces/enroll-actions'
import { recordSpaceCtaClickAction } from '@/lib/spaces/analytics-actions'

// ENROLL BUTTON (client). Calls the enrollInProgram server action for this Space's published program.
// The server re-validates the program + capacity + that the caller is not already enrolled, so this
// button is convenience, not the gate. On success it refreshes so the surface flips to the "you are
// enrolled" state.
//
// This is the role's primary CTA, so a click fires a `space.cta_click` event (Epic 1.11)
// fire-and-forget before the enroll action runs, so operators see CTA performance for the deep engine
// just as the placeholder session list did (the recorder is itself fail-safe and never blocks).
//
// HONESTY (CONTENT-VOICE skeptic test): the button says "Enroll" (not "Pay" / "Buy"); v1 takes no
// charge. When the program is full it disables with a plain label. No narrated feelings, no em/en
// dashes (CONTENT-VOICE §10).

export function EnrollButton({ spaceId, full }: { spaceId: string; full: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function enroll() {
    setError(null)
    // Fire-and-forget CTA telemetry (Epic 1.11): never awaited, never blocks the enroll.
    void recordSpaceCtaClickAction(spaceId)
    start(async () => {
      const result = await enrollInProgram(spaceId)
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
        onClick={enroll}
        disabled={pending || full}
        className="w-full justify-center"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Enrolling
          </>
        ) : full ? (
          'Program full'
        ) : (
          'Enroll'
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
