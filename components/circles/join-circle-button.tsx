'use client'

import { useActionState } from 'react'
import { joinCircle } from '@/app/(main)/circles/actions'
import { isError } from '@/lib/action-result'

// Join control for a circle. joinCircle redirects to the circle on success, so
// the only thing this ever renders back is a failure message (capacity, region
// cap, or a failed write) — surfaced inline instead of the old silent no-op.
export function JoinCircleButton({
  circleId,
  circleSlug,
  className,
  label = 'Join',
}: {
  circleId: string
  circleSlug: string
  className: string
  label?: string
}) {
  const [error, formAction, pending] = useActionState<string | null, FormData>(
    async () => {
      const res = await joinCircle(circleId, circleSlug)
      // A successful join redirects server-side; we only reach here on failure.
      return res && isError(res) ? res.error : null
    },
    null,
  )

  return (
    <form action={formAction}>
      <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
        {pending ? 'Joining…' : label}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </form>
  )
}
