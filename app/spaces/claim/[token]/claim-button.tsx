'use client'

import { useState, useTransition } from 'react'
import { Loader2, Zap } from 'lucide-react'
import { claimSpaceAction } from './actions'

export function ClaimSpaceButton({ token, size = 'md' }: { token: string; size?: 'md' | 'lg' }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClaim() {
    if (pending) return
    setError(null)
    startTransition(async () => {
      // On success the action redirects to the Space; only errors return.
      const res = await claimSpaceAction(token)
      if (res?.error) setError(res.error)
    })
  }

  const lg = size === 'lg'

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
      )}
      <button
        type="button"
        onClick={handleClaim}
        disabled={pending}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-control bg-primary font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover disabled:opacity-40 ${
          lg ? 'px-8 py-4 text-base' : 'px-5 py-2.5 text-sm'
        }`}
      >
        {pending ? (
          <Loader2 className={lg ? 'h-5 w-5 animate-spin' : 'h-4 w-4 animate-spin'} />
        ) : (
          <Zap className={lg ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />
        )}
        {pending ? 'Claiming' : 'Claim this business'}
      </button>
    </div>
  )
}
