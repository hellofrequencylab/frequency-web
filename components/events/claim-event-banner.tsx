'use client'

// "This is not my event" banner for an unclaimed, posted-on-behalf event. Names who
// posted it and who the organizer is, and gives the organizer a way to claim it: a
// button that emails the one-time claim link to the organizer contact on file (never
// to an address typed here). Copy is voice-canon: plain, sentence case, no em dashes.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BadgeCheck, Check, Loader2, Mail } from 'lucide-react'
import { requestClaimLink } from '@/app/(main)/events/[slug]/claim-actions'

export function ClaimEventBanner({
  eventId,
  organizerName,
  postedByName,
}: {
  eventId: string
  organizerName: string | null
  postedByName: string | null
}) {
  const [pending, start] = useTransition()
  const [state, setState] = useState<'idle' | 'sent' | 'sign_in' | 'no_email_on_file' | 'already_claimed' | 'unavailable'>('idle')
  const pathname = usePathname()

  function onClaim() {
    if (pending) return
    start(async () => {
      const res = await requestClaimLink(eventId)
      setState(res.ok ? 'sent' : res.error)
    })
  }

  return (
    <div className="mb-4 rounded-2xl border border-primary/40 bg-primary-bg/50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-text">
        <BadgeCheck className="h-4 w-4 text-primary" /> This event is community-posted
      </p>
      <p className="mt-1 text-sm text-muted">
        {postedByName ? <>Added by {postedByName} so locals can find it. </> : <>Added by a neighbor so locals can find it. </>}
        {organizerName ? <>It is run by <span className="font-semibold text-text">{organizerName}</span>.</> : <>The organizer is not on Frequency yet.</>}
      </p>

      {state === 'sent' ? (
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-success">
          <Check className="h-4 w-4" /> Sent. Check the organizer&rsquo;s email for the claim link.
        </p>
      ) : state === 'sign_in' ? (
        <p className="mt-2.5 text-sm text-muted">
          <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className="font-semibold text-primary-strong hover:underline">
            Sign in
          </Link>{' '}
          to claim this event.
        </p>
      ) : state === 'no_email_on_file' ? (
        <p className="mt-2.5 text-sm text-muted">
          There&rsquo;s no organizer email on file yet. Ask whoever posted it to share the claim link with you.
        </p>
      ) : state === 'already_claimed' ? (
        <p className="mt-2.5 text-sm text-muted">This event has already been claimed.</p>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onClaim}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Is this your event? Claim it
          </button>
          {state === 'unavailable' && (
            <span className="text-xs text-danger">Could not send right now. Try again in a moment.</span>
          )}
        </div>
      )}
    </div>
  )
}
