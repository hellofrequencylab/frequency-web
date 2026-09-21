'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Input, Label } from '@/components/ui/field'
import { buttonClasses } from '@/components/ui/button'
import { startGuestCheckoutAction } from '@/app/(main)/marketplace/commerce-actions'

// BUY WITHOUT AN ACCOUNT (LIVE-396), on the public Journey page.
//
// What this replaces: a single `Get access` link to /sign-in?next=… . That was the ENTIRE
// signed-out path in front of the one thing the page exists to do, and research puts forced
// account creation at 19-26% of checkout abandonment. Production on 2026-09-21 read 24
// checkout.session.expired against 1 completed.
//
// ── 🔴 ALWAYS HOSTED, NEVER THE ON-PAGE CARD FORM ───────────────────────────────────────────────
// The member till (ADR-1399) mounts Stripe Elements in place. This door deliberately does not, and
// the reason is the page it lives on: every page under app/discover declares `revalidate = 3600`
// and app/discover/static-render.test.ts fails the build if one reads auth, cookies or headers.
// Mounting Elements here would pull a publishable-key read and a Stripe bundle onto an ISR,
// crawlable surface to save one redirect for somebody who has no account yet. The hosted page is
// the ordinary flow for a stranger, so `forceHosted` is passed unconditionally and the only
// outcome this control handles is a URL to send them to.
//
// ── WHAT HAPPENS AFTER THE MONEY, and why the copy says so ──────────────────────────────────────
// A guest order settles with a NULL buyer and `guest_email` set. Access appears when they sign in
// with THAT address and claim_guest_orders() attaches it. So the address is not a marketing capture
// and it is not optional — it is the key to the thing they just bought, and the line under the
// field says exactly that rather than leaving them to discover it from a receipt.

export function JourneyGuestBuy({
  productId,
  priceLabel,
  signInHref,
}: {
  productId: string
  priceLabel: string
  /** The member door, kept beside the guest one: somebody who HAS an account should use it, so
   *  their purchase lands on their profile directly instead of waiting on a claim. */
  signInHref: string
}) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    // The honeypot is read off the FORM, not from state: it is deliberately uncontrolled so a bot
    // that fills fields directly still trips it. Reading it here is what makes the trap real --
    // rendering the field and never sending its value would be a decoration.
    const company = String(new FormData(e.currentTarget).get('company') || '')
    start(async () => {
      const r = await startGuestCheckoutAction({
        productId,
        email,
        company,
        // See the header: this door is hosted-only by design.
        forceHosted: true,
      })
      if (r.error) {
        setError(r.error)
        return
      }
      if (r.url) {
        window.location.href = r.url
        return
      }
      // The honeypot path returns an empty success, and a missing URL with no error should never
      // reach a real person. Say something true rather than leaving the button dead.
      setError('Could not start checkout. Please try again.')
    })
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor="guest-buy-email">Your email</Label>
        <Input
          id="guest-buy-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={pending}
        />
      </div>

      {/* The honeypot, matching the field name the action checks, and copied from
          components/events/guest-ticket-form.tsx rather than re-invented. Hidden from people and
          from assistive tech, tabIndex -1 so it is skipped by keyboard users instead of by bots.
          It stays a real text Input rather than type="hidden" because a bot that fills forms fills
          TEXT fields; a hidden input would never be touched and the trap would catch nothing. */}
      <div aria-hidden="true" className="hidden">
        <Label htmlFor="guest-buy-company">Company</Label>
        <Input id="guest-buy-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button type="submit" disabled={pending} className={buttonClasses('primary', 'md', 'w-full')}>
        {pending ? 'Starting checkout…' : `Get access · ${priceLabel}`}
      </button>

      {error ? (
        <p role="alert" className="text-2xs leading-relaxed text-danger">
          {error}
        </p>
      ) : null}

      <p className="text-2xs leading-relaxed text-muted">
        Buy now, then sign in with this address to open it. Every phase unlocks, and you can run it
        with your Circle or solo.
      </p>
      <p className="text-2xs leading-relaxed text-muted">
        Already have an account?{' '}
        <Link href={signInHref} className="underline underline-offset-2 hover:text-text">
          Sign in first
        </Link>
        .
      </p>
    </form>
  )
}
