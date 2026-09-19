'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Zap } from 'lucide-react'
import { claimListingAction } from '@/app/listings/claim/[token]/actions'
import { useViewer } from '@/components/layout/viewer-chrome'

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
  const viewer = useViewer()
  const isSignedIn = viewer.signedIn || signedIn

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
      <p className="text-body-sm text-muted">Frequency posted this for you. Claim it to make it yours to edit or close.</p>
      {error && (
        <p className="rounded-card border border-danger/40 bg-danger-bg px-3 py-2 text-body-sm text-danger">{error}</p>
      )}
      {isSignedIn ? (
        <button
          type="button"
          onClick={claim}
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" aria-hidden />}
          {pending ? 'Claiming' : 'Claim listing'}
        </button>
      ) : (
        <Link
          href={signInHref}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Zap className="h-4 w-4" aria-hidden /> Sign in to claim
        </Link>
      )}
    </div>
  )
}

/** Claim box for a `?claim=` arrival on a static listing page. Reads the token on the client so
 *  the page does not have to take `searchParams` (that opts the route out of ISR). Renders nothing
 *  when the URL has no token. */
export function ViewerListingClaim({ detailPath }: { detailPath: string }) {
  const token = useSearchParams().get('claim')
  const { signedIn } = useViewer()
  if (!token) return null
  return (
    <section className="rounded-2xl border border-primary/40 bg-primary-bg/40 p-4">
      <h2 className="mb-3 text-2xs font-semibold uppercase tracking-wide text-primary-strong">Claim this listing</h2>
      <ListingClaimBox
        token={token}
        signedIn={signedIn}
        signInHref={`/sign-in?next=${encodeURIComponent(`${detailPath}?claim=${token}`)}`}
      />
    </section>
  )
}
