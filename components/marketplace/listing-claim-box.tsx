'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, Zap } from 'lucide-react'
import { claimListingAction } from '@/app/listings/claim/[token]/actions'

// Shown on a seeded listing's public page IN PLACE OF "Contact the seller" when the visitor arrives
// through a claim link (/classifieds/<id>?claim=<token>). A signed-in visitor claims in place (the
// action transfers ownership + lands them on the now-theirs listing); a signed-out visitor is sent to
// sign in and returned here to finish. Everyone without a valid token never sees this (the page gates
// it), so a normal visitor just sees Contact the seller. Voice: plain, no em/en dashes; tokens only.
export function ListingClaimBox({
  token,
  signedIn,
  signInHref,
}: {
  token: string
  signedIn: boolean
  /** Where a signed-out visitor goes to sign in, returning to this claim link afterward. */
  signInHref: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function claim() {
    if (pending) return
    setError(null)
    startTransition(async () => {
      // On success the action redirects to the listing; only errors return.
      const res = await claimListingAction(token)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">Frequency posted this for you. Claim it to make it yours to edit or close.</p>
      {error && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {signedIn ? (
        <button
          type="button"
          onClick={claim}
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" aria-hidden />}
          {pending ? 'Claiming' : 'Claim listing'}
        </button>
      ) : (
        <Link
          href={signInHref}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Zap className="h-4 w-4" aria-hidden /> Sign in to claim
        </Link>
      )}
    </div>
  )
}
