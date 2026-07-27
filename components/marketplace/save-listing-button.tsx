'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import {
  saveListingAction,
  unsaveListingAction,
} from '@/app/(main)/marketplace/housing/[id]/edit/actions'

// The heart toggle for a housing listing (favorites, listing_saves). Optimistic: the
// heart flips instantly and quietly reverts if the server action fails. Signed-out
// visitors get the same heart as a link into /sign-in, so the affordance is always
// there. Mounted on the housing index cards (wrapper level) and the detail page —
// housing surfaces only; the shared ListingCard contract is untouched.

const BUTTON =
  'inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface/90 text-muted shadow-sm backdrop-blur transition-colors hover:text-text'

export function SaveListingButton({
  listingId,
  initialSaved,
  signedIn,
  signInNext = '/marketplace/housing',
}: {
  listingId: string
  /** Whether the viewer has already saved this listing (from the batched server read). */
  initialSaved: boolean
  signedIn: boolean
  /** Where /sign-in returns a signed-out visitor after they sign in. */
  signInNext?: string
}) {
  const [saved, setSaved] = useState(initialSaved)
  const [, start] = useTransition()

  if (!signedIn) {
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(signInNext)}`}
        aria-label="Sign in to save this home"
        title="Sign in to save this home"
        className={BUTTON}
      >
        <Heart className="h-4 w-4" aria-hidden />
      </Link>
    )
  }

  const toggle = () => {
    const next = !saved
    setSaved(next) // optimistic flip; revert below if the write fails
    start(async () => {
      try {
        await (next ? saveListingAction(listingId) : unsaveListingAction(listingId))
      } catch {
        setSaved(!next)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved' : 'Save this home'}
      title={saved ? 'Remove from saved' : 'Save this home'}
      className={BUTTON}
    >
      <Heart className={saved ? 'h-4 w-4 fill-primary text-primary' : 'h-4 w-4'} aria-hidden />
    </button>
  )
}
