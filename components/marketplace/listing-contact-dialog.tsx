'use client'

// THE LISTING "Contact + Offer" AFFORDANCE. A trigger button opens a Dialog where a buyer writes a
// message to the seller and (on goods that take offers) optionally names a price. Submitting opens or
// reuses a 1:1 DM with the seller and drops the message in; a named price also records an offer that
// feeds the right-rail "Highest offer". No payment happens in-app — this is message + optional offer.
//
// CLIENT boundary: this only imports the "use server" action (submitListingContact). It must NEVER pull
// server-only code (lib/auth, next/headers, the getHighestOfferCents read) into the client bundle — the
// highest offer and sign-in state are passed in as plain props by the server page.
//
// Styling mirrors components/spaces/space-share-button.tsx: Dialog + rounded-2xl border border-border
// bg-surface p-4/6, DAWN semantic tokens only (no hex). Voice (CONTENT-VOICE §10): plain labels, no
// narrated feelings, no em/en dashes.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { MessageCircle, Check, Tag } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { submitListingContact, type OfferTargetKind } from '@/lib/marketplace/listing-offers'
import { cn } from '@/lib/utils'

/** Cents to a plain USD label, e.g. 29900 -> "$299", 29950 -> "$299.50". Whole dollars drop the cents. */
function formatCents(cents: number): string {
  const dollars = cents / 100
  const whole = Number.isInteger(dollars)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/** Parse a free-typed dollar amount ("$1,299.50", "299") to whole cents, or null when blank/invalid. */
function dollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const dollars = Number.parseFloat(cleaned)
  if (!Number.isFinite(dollars) || dollars <= 0) return null
  return Math.round(dollars * 100)
}

export function ListingContactDialog({
  targetKind,
  targetId,
  sellerName,
  triggerLabel,
  viewerSignedIn,
  canOffer,
  highestOfferCents,
  revalidatePath,
  triggerClassName,
}: {
  targetKind: OfferTargetKind
  targetId: string
  sellerName: string
  triggerLabel: string
  viewerSignedIn: boolean
  /** False when the viewer is the owner or the listing has no reachable seller — hides the offer field. */
  canOffer: boolean
  highestOfferCents: number | null
  revalidatePath: string
  /** The template styles the trigger; falls back to a sensible primary button when omitted. */
  triggerClassName?: string
}): React.ReactNode {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [offer, setOffer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ conversationId: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function close() {
    setOpen(false)
    // Reset only after the close animation would matter; clearing the sent state lets a reopen start fresh.
    setError(null)
  }

  function submit() {
    setError(null)
    const trimmed = message.trim()
    if (!trimmed) {
      setError('Write a message first.')
      return
    }
    const offerCents = canOffer ? dollarsToCents(offer) : null
    startTransition(async () => {
      const result = await submitListingContact({
        targetKind,
        targetId,
        message: trimmed,
        offerCents,
        revalidate: revalidatePath,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setSent({ conversationId: result.conversationId })
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={
          triggerClassName ??
          'inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90'
        }
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        {triggerLabel}
      </button>

      <Dialog open={open} onClose={close} ariaLabel={`Contact ${sellerName}`} className="max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-pop sm:p-6">
          {sent ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-4 w-4" aria-hidden />
                </span>
                <h2 className="text-base font-semibold text-text">Message sent</h2>
              </div>
              <p className="text-sm text-muted">
                Message sent. {sellerName} will see it in messages.
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={`/messages/${sent.conversationId}`}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90"
                >
                  Open messages
                </Link>
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
                >
                  Close
                </button>
              </div>
            </div>
          ) : !viewerSignedIn ? (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-text">Contact {sellerName}</h2>
              <p className="text-sm text-muted">Sign in to contact the seller.</p>
              <Link
                href="/sign-in"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90"
              >
                Sign in
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-text">Contact {sellerName}</h2>
                <p className="mt-1 text-2xs text-subtle">
                  This opens a message. No payment happens here.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="listing-contact-message" className="block text-2xs font-semibold uppercase tracking-wide text-subtle">
                  Message
                </label>
                <textarea
                  id="listing-contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder={`Ask ${sellerName} a question or say you are interested.`}
                  className="w-full resize-y rounded-lg border border-border bg-surface-elevated/50 px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
                />
              </div>

              {canOffer && (
                <div className="space-y-1.5">
                  <label htmlFor="listing-contact-offer" className="block text-2xs font-semibold uppercase tracking-wide text-subtle">
                    Your offer <span className="font-normal normal-case text-subtle">(optional)</span>
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated/50 px-3 py-2 focus-within:border-primary">
                    <Tag className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                    <span className="text-sm text-muted">$</span>
                    <input
                      id="listing-contact-offer"
                      type="text"
                      inputMode="decimal"
                      value={offer}
                      onChange={(e) => setOffer(e.target.value)}
                      placeholder="0"
                      className="w-full bg-transparent text-sm text-text placeholder:text-subtle focus:outline-none"
                    />
                  </div>
                  {highestOfferCents != null && (
                    <p className="text-2xs text-muted">Highest offer: {formatCents(highestOfferCents)}</p>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-danger">{error}</p>}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className={cn(
                    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90',
                    pending && 'opacity-60',
                  )}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  {pending ? 'Sending' : 'Send message'}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </>
  )
}
