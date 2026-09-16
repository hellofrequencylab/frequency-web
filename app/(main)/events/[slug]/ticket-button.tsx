'use client'

import { useState, useTransition } from 'react'
import { Ticket, Loader2, Lock, Check, ChevronUp } from 'lucide-react'
import { startTicket, refundTicketAction, settleTicketAction } from './ticket-actions'
import { isError } from '@/lib/action-result'
import { ticketRowToPrice, type Price } from '@/lib/commerce/types'
import { PriceInput, type PriceSelection } from '@/components/commerce/price-input'
import { Button } from '@/components/ui/button'
import CheckoutPanel, { prefetchCheckoutForm } from '@/components/billing/checkout-panel'
import PaymentMarks from '@/components/billing/payment-marks'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'
import { compactPrice, ticketCtaLabel } from '@/lib/billing/price-label'

export type TicketTierView = {
  id: string
  name: string
  description: string | null
  pricingMode: 'fixed' | 'free' | 'pwyc' | 'sliding_scale' | 'donation'
  priceCents: number | null
  minCents: number | null
  suggestedCents: number | null
  /** Remaining inventory; null = unlimited. */
  spotsLeft: number | null
  soldOut: boolean
  memberOnly: boolean
  /** ADR-823: restricted to active members of the hosting Space's membership program. */
  spaceMembersOnly: boolean
  /** The specific membership tier that unlocks this ticket; null = any active membership. */
  spaceTierId: string | null
  /** What the unlocking membership costs (e.g. "$44/mo") — shown as the price to NON-members so
   *  the row communicates the real cost of access; members see the ticket's own price. */
  membershipPriceLabel: string | null
  /** ADR-1373: this tier's sales window hasn't opened yet. Resolved server-side against the
   *  event's true start instant; the checkout re-decides authoritatively. */
  notYetOnSale: boolean
  /** ADR-1373: this tier's sales window has closed. */
  salesClosed: boolean
  /** ADR-1373: when it opens, in the event's own zone ("Fri, Mar 5"). Null when nothing delays it. */
  opensOnLabel: string | null
}

const dollars = (cents: number | null | undefined) =>
  cents != null ? `$${(cents / 100).toFixed(2)}` : ''


function isBuyerChosen(mode: TicketTierView['pricingMode']) {
  return mode === 'pwyc' || mode === 'sliding_scale' || mode === 'donation'
}

/** Map a tier's legacy pricing columns onto the unified buyer Price (Pricing Options P2), so the shared
 *  PriceInput drives the buyer-chosen amount. */
function tierToPrice(t: TicketTierView): Price {
  return ticketRowToPrice({
    pricing_mode: t.pricingMode,
    price_cents: t.priceCents,
    min_cents: t.minCents,
    suggested_cents: t.suggestedCents,
  })
}

function modeLabel(t: TicketTierView): string {
  switch (t.pricingMode) {
    case 'free':
      return 'Free'
    case 'fixed':
      return dollars(t.priceCents)
    case 'pwyc':
      return 'Pay what you can'
    case 'sliding_scale':
      return 'Sliding scale'
    case 'donation':
      return 'Donation'
  }
}

/**
 * Everything the checkout needs that is NOT a session, started on intent.
 *
 * Two things used to be serial on the click: Stripe.js and the card form's own chunk. Both are
 * safe to fetch early because neither touches the server -- and the third wait, the Checkout
 * Session, is deliberately NOT warmed here. Creating one RESERVES A SEAT
 * (`reserve_ticket_atomic`, a 30-minute pending window), so warming it on hover would reserve a
 * ticket for every visitor who moved a mouse. Production already carries stale pending rows from
 * clicks alone.
 */
function warmCheckout(): void {
  // 🔴 A HEAD START MUST NEVER BE ABLE TO STOP A SALE. Both calls are optimisations -- the buyer
  // can pay without either -- so anything they throw is caught here rather than escaping into
  // `go()`, where it would abort the press before the drawer even opened. Loud, never silent: a
  // warm-up that has started failing is a real regression, it is just not the buyer's problem.
  try {
    warmStripeBrowser()
    prefetchCheckoutForm()
  } catch (err) {
    console.error('[checkout] warm-up failed; the purchase path is unaffected', err)
  }
}

/**
 * THE ONE TRIGGER, in its two states (LIVE-366).
 *
 * Closed it is the page's primary call to action and it names the price, because a CTA that hides
 * what it costs is the thing a buyer stops at. Open it goes QUIET -- `secondary`, not amber -- for
 * a reason that is not decoration: with the card layer up, Stripe renders its own amber "Pay $44",
 * and two amber buttons stacked is exactly the screen the owner called confusing. Only one control
 * on screen moves money, and while the drawer is open it is Stripe's.
 *
 * 🔴 WHEN OPEN IT IS NOT A BUTTON AT ALL. It was a quiet `secondary` one, sitting directly above
 * Stripe's amber "Pay $44", and the owner's reading of the live page was blunt: "the second button
 * seems really redundant." They were right, and the reason is worth keeping. Two stacked buttons
 * for one act is confusing on its own, and it got worse because the thing that belongs BETWEEN
 * them -- the card fields -- renders blank while Stripe fetches, so the two collapsed together
 * into one meaningless pair.
 *
 * Open, this is a one-line text control instead: same job (fold the drawer back up), none of a
 * button's weight. Only one control on screen looks like it moves money, and it is Stripe's.
 */
function CheckoutTrigger({
  open,
  pending,
  disabled,
  label,
  onOpen,
  onCollapse,
}: {
  open: boolean
  pending: boolean
  disabled?: boolean
  /** What the button says when it is the CTA. Carries the price. */
  label: string
  onOpen: () => void
  /** Fold the drawer back up. Never called while a payment is in flight -- the panel owns that. */
  onCollapse: () => void
}) {
  if (open) {
    return (
      <button
        type="button"
        onClick={onCollapse}
        aria-expanded
        className="flex w-full items-center justify-center gap-1 rounded-control py-1 text-meta font-semibold text-subtle transition-colors hover:text-text"
      >
        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        Cancel
      </button>
    )
  }

  return (
    <Button
      onClick={onOpen}
      onPointerEnter={warmCheckout}
      onFocus={warmCheckout}
      onTouchStart={warmCheckout}
      disabled={disabled}
      loading={pending}
      aria-expanded={false}
      className="w-full justify-center"
    >
      <Ticket className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  )
}

// Ticket selector on a paid event (EVENTS-SYSTEM §2.2). When the event has tiers we
// render a chooser; for pay-what-you-can / sliding-scale / donation tiers an amount
// input prefilled with the suggested value, floored at the tier minimum. A single
// implicit fixed tier (event flat price, no tier rows) renders the simple button.
export function TicketButton({
  eventId,
  priceLabel,
  tiers,
  membershipSpace,
  viewerIsSpaceMember,
  viewerSpaceTierId,
  eventSlug,
  previewMode,
}: {
  eventId: string
  /** Used only for the implicit flat-price (no-tier) case. */
  priceLabel: string
  /** The event's ticket tiers; empty = implicit flat-price fixed tier. */
  tiers?: TicketTierView[]
  /** The hosting Space (ADR-823) — names the members-only chip + the join pointer. */
  membershipSpace?: { name: string; slug: string } | null
  /** Does the viewer hold an active membership in the hosting Space? */
  viewerIsSpaceMember?: boolean
  /** The viewer's membership tier id in the hosting Space (tier-specific gates compare on it). */
  viewerSpaceTierId?: string | null
  /** This event's slug — the join pointer carries it as return_to so joining loops back here. */
  eventSlug?: string
  /** Manager-only payments preview: render the full buyer UI with checkout disabled (payouts not
   *  connected yet). The page gates who sees this; the server would refuse a checkout anyway. */
  previewMode?: boolean
}) {
  const hasTiers = !!tiers && tiers.length > 0
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Does the viewer's membership unlock a gated tier (ADR-823)? Tier-specific gates need THE
  // named membership tier; a plain members gate takes any active membership.
  const unlocked = (t: TicketTierView) =>
    !!viewerIsSpaceMember && (t.spaceTierId == null || t.spaceTierId === viewerSpaceTierId)
  // A tier nobody can buy right now (ADR-1373). Treated exactly like sold out for selection and for
  // the CTA, because the two are the same fact to a buyer: this row is not purchasable today. The
  // difference is what the row SAYS, which is handled in the price slot below.
  const offSale = (t: TicketTierView) => t.notYetOnSale || t.salesClosed
  // Selected tier id (tiered events) and the per-tier buyer amount (dollars string). A MEMBER's
  // included ticket preselects — a member landing on their own event should not find the paid
  // Day pass highlighted over the ticket their membership already covers.
  const [selectedId, setSelectedId] = useState<string | null>(
    hasTiers
      ? // A member's own open ticket first, then any tier that can actually be bought right now, then
        // the first row. Preselecting a tier that is off sale would land a buyer on a dead CTA.
        (tiers!.find((t) => !t.soldOut && !offSale(t) && t.spaceMembersOnly && unlocked(t))?.id ??
          tiers!.find((t) => !t.soldOut && !offSale(t))?.id ??
          tiers!.find((t) => !t.soldOut)?.id ??
          tiers![0].id)
      : null,
  )
  const selected = hasTiers ? tiers!.find((t) => t.id === selectedId) ?? null : null
  // The buyer-chosen amount for a pwyc / sliding_scale / donation tier, surfaced by the shared
  // PriceInput (which pre-fills the suggested anchor and enforces the floor). null for a fixed / free tier.
  const [selection, setSelection] = useState<PriceSelection | null>(null)

  /**
   * Set once the server hands back a session that renders here. Null means "no on-page session",
   * which is the state every hosted checkout stays in.
   */
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  /**
   * Is the drawer showing? Tracked SEPARATELY from the client secret so collapsing keeps the
   * session: re-opening is then instant and, more importantly, does not reserve a SECOND seat.
   * A secret is dropped only when what it was created for changed -- a different tier, a different
   * amount -- which the two setters below own.
   */
  const [open, setOpen] = useState(false)

  /**
   * The session id behind `clientSecret`, kept so the purchase can be settled the instant it is
   * paid rather than whenever the webhook lands (LIVE-366). Null on the hosted path, which settles
   * on its own landing page.
   */
  const [sessionId, setSessionId] = useState<string | null>(null)

  /**
   * The LAST line of defence. If the form cannot mount or confirm at all — Stripe.js blocked, the
   * session unloadable, confirm throwing — the buyer must still be able to pay. Dropping the
   * secret and re-running `go()` asks the server again; with the on-page path having just failed
   * in the browser, what matters is that this ends at a working checkout rather than a dead form.
   */
  function fallBackToHosted() {
    setClientSecret(null)
    setSessionId(null)
    setError('Opening secure checkout…')
    startTransition(async () => {
      // 🔴 forceHosted IS LOAD-BEARING. Without it this asks for the same elements session that
      // just failed to mount, gets a second client secret, finds no `url`, and dead-ends the
      // buyer. That was the live 2026-09-15 failure.
      const r = await startTicket(eventId, {
        qty: 1,
        ticketTypeId: selected?.id ?? null,
        forceHosted: true,
      })
      if (!isError(r) && r.data.url) window.location.href = r.data.url
      else setError('Could not start checkout. Please try again.')
    })
  }

  /**
   * Fold the drawer back up without touching the session.
   *
   * ⚠️ THE PENDING TICKET STAYS PENDING, deliberately. The session that was created is still good
   * for its 30-minute window, and `checkout.session.expired` sweeps it if the buyer never returns.
   * Cancelling it here would mean a round trip to close a drawer, and would lose the seat the
   * reservation is holding for someone who is coming right back.
   */
  function collapse() {
    setOpen(false)
    setError(null)
  }

  function selectTier(t: TicketTierView) {
    setSelectedId(t.id)
    setError(null)
    setSelection(null)
    // 🔴 THE OPEN SESSION IS FOR THE OLD TIER. Keeping it would charge the previous row's price
    // behind a form that now sits under a different selection -- the one bug in this pattern that
    // takes money for the wrong thing. Dropping it costs one round trip on the next press.
    setClientSecret(null)
    setSessionId(null)
    setOpen(false)
  }

  function go() {
    setError(null)
    // A session we already hold is re-shown WITHOUT asking the server again. The buyer who
    // collapsed the drawer and changed their mind gets it back instantly, and no second seat is
    // reserved. `selectTier` and the amount input drop the secret whenever it stops matching what
    // the button now names, so this can never re-open a form for the wrong price.
    if (clientSecret) {
      setOpen(true)
      return
    }
    // 🔴 THE THREE WAITS NOW OVERLAP. Downloading Stripe.js used to start only once a client
    // secret existed, so the buyer waited for the server to build a session and THEN for the
    // script. `warmCheckout` starts BOTH the script and the form's chunk alongside the server
    // round trip -- and it is called here as well as on hover, because a pointer that never
    // hovered (a tap, a keyboard) would otherwise reach this line having warmed nothing.
    // Idempotent and memoised, so the hover case pays nothing for the second call.
    warmCheckout()
    const tier = selected
    // Client-side floor hint (the server re-enforces it authoritatively).
    let amountCents: number | undefined
    if (tier && isBuyerChosen(tier.pricingMode)) {
      if (!selection || !selection.valid || selection.amountCents == null) {
        setError(selection?.error ?? 'Enter an amount.')
        return
      }
      amountCents = selection.amountCents
    }
    // 🔴 OPEN FIRST, ASK SECOND. The drawer used to appear only once the server answered, so the
    // press produced nothing for the length of a round trip. Opening here costs nothing -- no
    // session exists yet, so no seat is reserved -- and the panel animates a card-shaped
    // placeholder until the secret lands. An error below closes it again.
    setOpen(true)
    startTransition(async () => {
      const r = await startTicket(eventId, {
        qty: 1,
        ticketTypeId: tier?.id ?? null,
        amountCents,
      })
      if (isError(r)) {
        // Close what we optimistically opened, and say the real reason. A sold-out answer must
        // read as sold out, never as a checkout that failed to load.
        setOpen(false)
        setError(r.error)
      } else if (r.data.free) {
        // A free tier: nothing to charge. Refresh so the page reflects the claim.
        window.location.reload()
      } else if (r.data.clientSecret) {
        // ON-PAGE (LIVE-347): the card form opens right here, under the button, and the buyer
        // never leaves Frequency. Branching on what CAME BACK rather than on what was asked for
        // is deliberate — the server declines the on-page path whenever it cannot be honoured,
        // and the next branch catches that without this component needing to know why.
        setClientSecret(r.data.clientSecret)
        setSessionId(r.data.sessionId ?? null)
        setOpen(true)
      } else if (r.data.url) {
        // The on-page path declined; this is the hosted redirect. Close first so the skeleton is
        // not left animating behind a navigation that may take a moment to commit.
        setOpen(false)
        window.location.href = r.data.url
      }
    })
  }

  // ── Implicit flat-price (no tiers): one button, one drawer ──
  if (!hasTiers) {
    return (
      <div className="space-y-2">
        <CheckoutTrigger
          open={open}
          pending={isPending}
          disabled={previewMode}
          label={ticketCtaLabel(priceLabel)}
          onOpen={go}
          onCollapse={collapse}
        />
        {error && <p className="text-body-sm text-danger">{error}</p>}
        {open && (
          <CheckoutPanel
            clientSecret={clientSecret}
            priceLabel={compactPrice(priceLabel)}
            onFellBack={fallBackToHosted}
            onPaid={sessionId ? () => settleTicketAction(sessionId) : undefined}
            // Closing after a completed payment reloads so the page shows what was just bought:
            // the ticket row, the updated count, the RSVP state. `location.reload()` rather than
            // router.refresh() because the purchase changes server-rendered state well outside
            // this component's subtree.
            onClose={() => window.location.reload()}
          />
        )}
        {/* UNDER the button, and it STAYS under it while the drawer is open -- the drawer opens
            between the two, so pressing the button pushes this down rather than replacing it. */}
        <PaymentMarks className="pt-0.5" />
      </div>
    )
  }

  // ── Tiered selector ──
  const buyerChosen = selected ? isBuyerChosen(selected.pricingMode) : false
  const ctaDisabled = !selected || selected.soldOut || offSale(selected) || previewMode

  /**
   * What the trigger says, for the tier that is selected RIGHT NOW.
   *
   * The price is in the label because the owner asked for it and because a CTA that hides its
   * price is where a buyer stops. That means it has to be honest in five shapes, not one:
   *
   *  · a members ticket their membership covers costs nothing more -> no number at all
   *  · a members ticket it does NOT cover is really the membership's price, so the button says
   *    nothing about a ticket price it cannot charge; the join pointer below carries the offer
   *  · a free tier is free
   *  · pay-what-you-can names the amount the buyer has actually typed, or no amount yet
   *  · a fixed tier names its own price, not the event's flat `priceLabel`
   *
   * A wrong number here is a price promise we then fail to keep at the card form.
   */
  function ctaLabel(): string {
    const t = selected
    if (!t) return 'Get tickets'
    if (t.spaceMembersOnly && !unlocked(t)) return 'Members only'
    // A member's included ticket lands here too: its pricing mode IS free, so it costs them
    // nothing more and the button must not invent a number for it.
    if (t.pricingMode === 'free') return 'Get ticket'
    if (isBuyerChosen(t.pricingMode)) {
      const cents = selection?.valid ? selection.amountCents : null
      return cents != null ? ticketCtaLabel(dollars(cents)) : 'Get tickets'
    }
    return t.priceCents != null ? ticketCtaLabel(dollars(t.priceCents)) : 'Get tickets'
  }

  return (
    <div className="space-y-3">
      {/* ── THE BUTTON LEADS ─────────────────────────────────────────────────────────────────
          Price-led CTA first, the accepted-card row under it, the ticket options under that.
          Pressing the button opens the card layer BETWEEN the button and the marks, so both the
          marks and the options are pushed down rather than swapped out: nothing a buyer was
          looking at disappears when they commit. */}
      <CheckoutTrigger
        open={open}
        pending={isPending}
        disabled={ctaDisabled}
        label={ctaLabel()}
        onOpen={go}
        onCollapse={collapse}
      />
      {error && <p className="text-body-sm text-danger">{error}</p>}
      {open && (
        <CheckoutPanel
          clientSecret={clientSecret}
          priceLabel={compactPrice(priceLabel)}
          onFellBack={fallBackToHosted}
          onPaid={sessionId ? () => settleTicketAction(sessionId) : undefined}
          // Closing after a completed payment reloads so the page shows what was just bought:
          // the ticket row, the updated count, the RSVP state. `location.reload()` rather than
          // router.refresh() because the purchase changes server-rendered state well outside
          // this component's subtree.
          onClose={() => window.location.reload()}
        />
      )}
      <PaymentMarks />
      <div className="space-y-2">
        {tiers!.map((t) => {
          const active = t.id === selectedId
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTier(t)}
              disabled={t.soldOut || offSale(t)}
              aria-pressed={active}
              className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                active
                  ? 'border-primary bg-primary-bg'
                  : 'border-border bg-surface hover:border-border-strong'
              }`}
            >
              <div className="min-w-0">
                {/* Title stays ONE line (truncate); tags sit on their own row below so a long
                    tier name never wraps around a chip (owner spec). */}
                <p className="truncate text-body-sm font-semibold text-text">{t.name}</p>
                {(t.memberOnly || t.spaceMembersOnly) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {t.memberOnly && (
                      <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
                        Members
                      </span>
                    )}
                    {t.spaceMembersOnly &&
                      (unlocked(t) ? (
                        // Member: their membership covers this ticket.
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-1.5 py-0.5 text-2xs font-medium text-primary-strong">
                          <Check className="h-2.5 w-2.5" />
                          Member
                        </span>
                      ) : (
                        // Non-member / signed out: this row IS the membership offer.
                        <span className="inline-flex items-center gap-1 rounded-md bg-success-bg px-1.5 py-0.5 text-2xs font-medium text-success">
                          <Lock className="h-2.5 w-2.5" />
                          Membership
                        </span>
                      ))}
                  </div>
                )}
                {t.description && <p className="mt-0.5 text-meta text-muted">{t.description}</p>}
                {t.spotsLeft != null && !t.soldOut && (
                  <p className="mt-0.5 text-meta text-subtle">{t.spotsLeft} left</p>
                )}
              </div>
              <span className="shrink-0 text-body-sm font-semibold text-text">
                {t.soldOut ? (
                  <span className="text-subtle">Sold out</span>
                ) : t.notYetOnSale ? (
                  // Not open yet (ADR-1373): say WHEN, in the event's own zone. A dead button with
                  // no date is the thing this feature exists to stop. A members row that the
                  // viewer's membership already opens never reaches here, because its own window
                  // has started.
                  <span className="text-subtle">
                    {t.opensOnLabel
                      ? `Opens to ${t.spaceMembersOnly ? 'members' : 'guests'} on ${t.opensOnLabel}`
                      : 'Not on sale yet'}
                  </span>
                ) : t.salesClosed ? (
                  <span className="text-subtle">Sales closed</span>
                ) : t.spaceMembersOnly && !unlocked(t) && t.membershipPriceLabel ? (
                  // Non-member (or signed out) on a members ticket: the price of ACCESS is the
                  // membership, so show that instead of a misleading bare "Free".
                  t.membershipPriceLabel
                ) : t.spaceMembersOnly && unlocked(t) && t.pricingMode === 'free' ? (
                  // A member's free members ticket costs them nothing more: it's Included.
                  'Included'
                ) : (
                  modeLabel(t)
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* Members-included ticket the viewer's membership doesn't unlock (ADR-823): an honest lock
          with a join pointer, instead of a surprise refusal at checkout. The link carries return_to
          so joining loops straight back to this event. Server gate stays authoritative. */}
      {selected && selected.spaceMembersOnly && !unlocked(selected) && membershipSpace && (
        <p className="rounded-lg bg-surface-elevated px-3 py-2 text-meta text-muted">
          This ticket is included with a {membershipSpace.name} membership.{' '}
          <a
            href={`/spaces/${membershipSpace.slug}${eventSlug ? `?return_to=${encodeURIComponent(`/events/${eventSlug}`)}` : ''}`}
            className="font-semibold text-text underline underline-offset-2"
          >
            Join on their page
          </a>{' '}
          and it brings you back here.
        </p>
      )}

      {/* Buyer-chosen amount for pwyc / sliding_scale / donation tiers (Pricing Options P2): the shared
          PriceInput pre-fills the suggested anchor and enforces the floor. Keyed by tier so it re-seeds. */}
      {selected && buyerChosen && !selected.soldOut && (
        <PriceInput
          key={selected.id}
          price={tierToPrice(selected)}
          disabled={isPending}
          idPrefix={`tier-${selected.id}`}
          // Same reason as `selectTier`: a session built for $20 must not stay open under a
          // button that now says $50. Changing the amount drops it; the next press rebuilds it.
          onChange={(next) => {
            setSelection(next)
            setClientSecret(null)
            setSessionId(null)
            setOpen(false)
          }}
        />
      )}

    </div>
  )
}

// Host-facing refund control for one sold ticket (EVENTS-SYSTEM §7). Confirms, then
// calls the authz-checked refund action. The Stripe refund reverses the transfer
// and returns the platform fee; the row flips to `refunded` and frees capacity.
export function RefundTicketButton({
  ticketId,
  eventId,
  slug,
  amountLabel,
}: {
  ticketId: string
  eventId: string
  slug: string
  amountLabel: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function refund() {
    if (!confirm(`Refund this ${amountLabel} ticket? The buyer is refunded in full and the spot is freed.`)) return
    setError(null)
    startTransition(async () => {
      const r = await refundTicketAction(ticketId, eventId, slug)
      if (isError(r)) setError(r.error)
      else setDone(true)
    })
  }

  if (done) return <span className="text-meta font-medium text-muted">Refunded</span>

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={refund}
        disabled={isPending}
        className="inline-flex items-center gap-1 text-meta font-medium text-subtle underline underline-offset-2 hover:text-danger transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        Refund
      </button>
      {error && <span className="text-meta text-danger">{error}</span>}
    </span>
  )
}
