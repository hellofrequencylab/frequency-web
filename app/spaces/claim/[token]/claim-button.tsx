'use client'

import { useState, useTransition } from 'react'
import { Loader2, Zap } from 'lucide-react'
import { claimSpaceAction } from './actions'
import { buttonClasses } from '@/components/ui/button'

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
        <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-body-sm text-danger">{error}</p>
      )}
      <button
        type="button"
        onClick={handleClaim}
        disabled={pending}
        className={buttonClasses('primary', lg ? 'lg' : 'md', 'w-full')}
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
