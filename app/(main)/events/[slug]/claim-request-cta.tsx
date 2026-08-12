'use client'

// "Is this your event? Claim it" — the PUBLIC claim CTA for a seeded, still-unclaimed listing.
//
// WHY THIS EXISTS AGAIN. A public claim banner shipped in June 2026 and was dropped on
// 2026-07-13 (#1751, "drop claim banner") because the seeder now hands the listing off
// privately through the "Send to host" link in the QR & Share popup. That directive was about
// the CLAIM LINK being surfaced to every visitor. This CTA never carries the link: pressing it
// calls `requestClaimLink`, which re-sends the one-time token to the organizer contact ALREADY
// ON FILE and to nobody else. A stranger pressing it learns nothing and gains nothing; the
// organizer gets the mail they were always supposed to get. That is the whole reason
// `requestClaimLink` was written (see its header) and it had no render path until now.
//
// Client only because it needs a pending state and a result line. Everything above it on the
// event page stays a Server Component — this is the smallest possible interactive leaf.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check, Loader2, Mail } from 'lucide-react'
import { requestClaimLink } from './claim-actions'

type State = 'idle' | 'sent' | 'sign_in' | 'no_email_on_file' | 'already_claimed' | 'unavailable'

export function ClaimRequestCta({
  eventId,
  organizerName,
}: {
  eventId: string
  /** The organizer named on the listing, when the seeder recorded one. */
  organizerName: string | null
}) {
  const [pending, start] = useTransition()
  const [state, setState] = useState<State>('idle')
  const pathname = usePathname()

  function onRequest() {
    if (pending) return
    start(async () => {
      const res = await requestClaimLink(eventId)
      setState(res.ok ? 'sent' : res.error)
    })
  }

  return (
    <div className="mb-5 rounded-2xl border border-primary/40 bg-primary-bg/50 px-5 py-4">
      <p className="text-body font-bold text-text">Is this your event?</p>
      <p className="mt-1 text-body-sm text-muted">
        Frequency put this page up so people nearby could find it.{' '}
        {organizerName ? (
          <>
            It&rsquo;s run by <span className="font-semibold text-text">{organizerName}</span>. We can
            email the claim link to the organizer address on file.
          </>
        ) : (
          <>We can email the claim link to the organizer address on file.</>
        )}{' '}
        We never show that address here.
      </p>

      {state === 'sent' ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-body-sm font-semibold text-success">
          <Check className="h-4 w-4" aria-hidden /> Sent. The claim link is in the organizer&rsquo;s inbox.
        </p>
      ) : state === 'sign_in' ? (
        <p className="mt-3 text-body-sm text-muted">
          <Link
            href={`/sign-in?next=${encodeURIComponent(pathname)}`}
            className="font-semibold text-primary-strong hover:underline"
          >
            Sign in
          </Link>{' '}
          to ask for the claim link.
        </p>
      ) : state === 'already_claimed' ? (
        <p className="mt-3 text-body-sm text-muted">This event already has a host.</p>
      ) : state === 'no_email_on_file' ? (
        <p className="mt-3 text-body-sm text-muted">
          There&rsquo;s no organizer email on file yet. Ask whoever posted this event to send you the
          claim link.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRequest}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Mail className="h-4 w-4" aria-hidden />
            )}
            {/* Not "email ME": the link goes to the address ON FILE, which may not be the person
                pressing the button. The label has to be true for a stranger too. */}
            {pending ? 'Sending' : 'Send the claim link'}
          </button>
          {state === 'unavailable' && (
            <span className="text-body-sm text-danger">That didn&rsquo;t send. Try again in a minute.</span>
          )}
        </div>
      )}
    </div>
  )
}
