'use client'

// The listing claim landing (/listings/claim/<token>) on the Frequency design. The route still resolves
// the one-time token and 404s on an unknown, used or removed one (a guessed token learns nothing); this
// draws what it found. Signed out: a sign-in link that returns here. Signed in: one tap, through the SAME
// claimListingAction (which re-checks the token and does the transfer, then redirects to the listing).

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { claimListingAction } from '@/app/listings/claim/[token]/actions'
import { FnStage } from './parts'

export interface ListingClaimPreview {
  title: string
  kindLabel: string
  location: string | null
  facts: string[]
  description: string | null
  image: string | null
}

function ClaimListingButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClaim() {
    if (pending) return
    setError(null)
    startTransition(async () => {
      // On success the action redirects to the listing; only errors return.
      const res = await claimListingAction(token)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <>
      {error && (
        <p className="jx-err" role="alert">
          {error}
        </p>
      )}
      <button className="btn fq-iri-btn" type="button" onClick={handleClaim} disabled={pending}>
        {pending ? 'Claiming…' : 'Claim this listing'}
      </button>
    </>
  )
}

export function FrequencyListingClaim({
  token,
  preview,
  signedIn,
}: {
  token: string
  preview: ListingClaimPreview
  signedIn: boolean
}) {
  return (
    <FnStage>
      <div className="fn-box">
        <h1 className="fn-h1">Claim your listing</h1>
        <p>A neighbor added this to Frequency so people nearby could find it. If it&apos;s yours, claim it to manage it.</p>
        <div className="fn-card">
          {preview.image && (
            // eslint-disable-next-line @next/next/no-img-element -- a library-media URL of unknown size
            <img src={preview.image} alt="" />
          )}
          <span className="fn-k">{preview.kindLabel}</span>
          <b>{preview.title}</b>
          {preview.location && <span>{preview.location}</span>}
          {preview.facts.length > 0 && <span>{preview.facts.join(' · ')}</span>}
          {preview.description && <span className="fn-desc">{preview.description}</span>}
        </div>
        <p>
          Claiming makes it yours: you can edit the details, hear from people who are interested, and run it from your
          own account. It takes one tap.
        </p>
        {signedIn ? (
          <ClaimListingButton token={token} />
        ) : (
          <>
            <Link className="btn fq-iri-btn" href={`/sign-in?next=/listings/claim/${token}`}>
              Sign in to claim it
            </Link>
            <p className="jx-fine">New here? Signing in creates your account in a minute.</p>
          </>
        )}
      </div>
    </FnStage>
  )
}
