'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronUp, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CheckoutPanel from '@/components/billing/checkout-panel'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'
import { isError } from '@/lib/action-result'
import { formatPriceCents } from '@/lib/commerce/types'
import {
  joinTier,
  startSpaceMembershipCheckout,
  settleSpaceMembershipAction,
} from '@/lib/spaces/memberships-actions'
import type { MembershipInterval, MembershipTier } from '@/lib/spaces/memberships'
import {
  annualSavingLabel,
  tierPriceView,
  type BillingInterval,
} from '@/lib/spaces/membership-pricing'

// MEMBER JOIN CARD (client). One tier rendered as a kit card (name, price, interval, benefits) with
// a Join button. The server re-validates the tier + that the caller is not already a member, so this
// card is convenience, not the gate.
//
// ONE CARD PER MEMBERSHIP, NOT PER CADENCE (ADR-1374). `interval` is what the toggle above the grid
// is set to (membership-tier-picker.tsx). A tier with a yearly price shows it, with the saving
// computed from the operator's two real numbers; a tier without one keeps its monthly price and
// says "Monthly only" rather than looking like a yearly offer it cannot honor; a free tier ignores
// the toggle. The same cadence rides into checkout and into the recorded membership.
//
// TWO PATHS (Pricing P3): while billing is OFF (billingOn=false) the button keeps the EXACT
// display-only behavior — joinTier records a membership and takes no charge. When billing is live AND
// the tier is paid, Join opens Stripe Checkout (startSpaceMembershipCheckout); if checkout no-ops
// (e.g. the owner is not payout-ready), it falls back to the free join path, so the button is never
// broken. A free ($0) tier always uses joinTier.
//
// HONESTY (CONTENT-VOICE skeptic test): while OFF the price is labeled as what membership WILL cost;
// the button says "Join" (not "Pay") and the helper line says no payment is taken yet. No narrated
// feelings, no em/en dashes (CONTENT-VOICE §10).

/** Cents to a plain price label, e.g. 2500 -> "$25", 2550 -> "$25.50". Whole dollars drop the
 *  cents. USD only in v1 (a currency column is a later, additive expansion). */
export function formatPrice(cents: number): string {
  // The ONE house price format (lib/commerce/types.ts); this was a verbatim copy of it.
  return formatPriceCents(cents)
}

/** A short per-interval suffix for the price label. */
export function intervalLabel(interval: MembershipInterval): string {
  if (interval === 'month') return 'per month'
  if (interval === 'year') return 'per year'
  return 'one time'
}

export function MembershipJoinCard({
  spaceId,
  tier,
  billingOn = false,
  includedEvents = [],
  spotsLeft = null,
  interval = 'month',
  featured = false,
  layout = 'card',
}: {
  spaceId: string
  tier: MembershipTier
  /** The cadence the member picked on the toggle above the cards (ADR-1374). A tier with no yearly
   *  price keeps showing its monthly one and says so; a free tier ignores this entirely. */
  interval?: BillingInterval
  /** When true (billing live), a PAID tier joins via Stripe Checkout; otherwise the display-only
   *  joinTier path is used (unchanged OFF behavior). */
  billingOn?: boolean
  /** Upcoming events whose members-only ticket THIS tier unlocks (ADR-823) — advertised on the
   *  card so a configured ticket gate markets the membership by itself. */
  includedEvents?: { slug: string; title: string }[]
  /** Remaining capacity (ADR-824); null = unlimited. 0 = full (waitlist or closed). */
  spotsLeft?: number | null
  /** The one plan the grid leans on. Carries the heavier chrome ladder (lift-2, a primary border and
   *  ring, more padding) and the only solid CTA in the set, so a reader's eye lands somewhere. The
   *  caller resolves it ONCE from the tier set; never pass it per render site, because two callers
   *  disagreeing is how a page comes to crown two different plans. */
  featured?: boolean
  /** `card` is the grid tile. `bar` is the full-width row the free tier takes above the grid: same
   *  join logic, same states, laid out horizontally because a free tier has one short list and a
   *  card of it is mostly empty space.
   *
   *  `band` is the prestige rung, below the grid and ON THE CANVAS with no fill of its own. A
   *  prestige tier loses when it is COMPARED and wins when it is ENCOUNTERED: inside the grid it
   *  reads as the worst value per bullet, because that is arithmetically what it is. Out of the
   *  grid, after the ordinary decision has been made, it asks a different question. The restraint
   *  is the point, so this layout deliberately has less chrome than the cards above it, not more. */
  layout?: 'card' | 'bar' | 'band'
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // ON-PAGE CHECKOUT (CHECKOUT-HANDOFF §4). `open` is SEPARATE from the session on purpose:
  // collapsing the drawer keeps it, so re-opening is instant and, more importantly, does not mint a
  // SECOND subscription session for the same member.
  //
  // 🔴 THE SESSION CARRIES THE CADENCE IT WAS MINTED FOR, and that is the whole guard. A form minted
  // for $44 a month must never sit under an $88 a year button, and the toggle above these cards can
  // change that between one render and the next. Storing the two apart and resyncing them in an
  // effect is a reactive patch over a structural problem: it also renders the stale form for one
  // frame before the effect runs. Keeping them in one value makes a mismatched session
  // unrepresentable instead, so the check below is a comparison rather than a lifecycle.
  const [session, setSession] = useState<{
    cadence: MembershipInterval
    clientSecret: string
    sessionId: string | null
  } | null>(null)
  const [open, setOpen] = useState(false)

  // What this card charges at the selected cadence (ADR-1374). `monthlyOnly` is the honest case the
  // toggle creates: yearly is selected, this tier has no yearly price, so it keeps its monthly one
  // and must say that rather than sitting beside a yearly card looking identical.
  const price = tierPriceView(tier, interval)
  const saving =
    price.cadence === 'year' && !price.free
      ? annualSavingLabel(tier.priceCents, tier.annualPriceCents)
      : null
  const free = price.free
  const full = spotsLeft != null && spotsLeft <= 0
  // Join-and-return (ADR-823): an event page's "join their membership" pointer carries
  // ?return_to=/events/<slug>, so after joining the member lands back on the ticket they came
  // for. SAFETY: only a same-origin absolute path is honored (a leading single slash) — anything
  // else (full URLs, protocol-relative "//host") is dropped, so the param can never redirect off-site.
  const rawReturn = searchParams.get('return_to')
  const returnTo = rawReturn && /^\/(?!\/)/.test(rawReturn) ? rawReturn : null

  // The session, but only while it still matches what the button now charges. A cadence change makes
  // this null on the very same render that changes the price, so there is no window in which the two
  // disagree.
  const liveSession = session && session.cadence === price.cadence ? session : null

  /** The LAST line of defence (CHECKOUT-HANDOFF §4). `forceHosted` is load-bearing: without it this
   *  asks for the same elements session that just failed to mount, finds no url, and dead-ends a
   *  member who is trying to pay. */
  function fallBackToHosted() {
    setSession(null)
    setError('Opening secure checkout…')
    if (!tier.id) return
    const tierId = tier.id
    start(async () => {
      const r = await startSpaceMembershipCheckout(
        spaceId,
        tierId,
        price.cadence === 'year' ? 'year' : 'month',
        { forceHosted: true },
      )
      if (!isError(r) && r.data.url) window.location.href = r.data.url
      else setError('Could not start checkout. Please try again.')
    })
  }

  function join() {
    if (!tier.id) return
    setError(null)
    const tierId = tier.id

    // Already have a session for THIS cadence: re-open it rather than spending a round trip and
    // minting a second subscription session for the same member.
    if (liveSession) {
      setOpen(true)
      return
    }

    start(async () => {
      // Paid tier with billing live: try checkout first. If it no-ops (owner not payout-ready,
      // billing off, etc.) fall back to the free join path so the button is never broken. A FULL
      // tier skips checkout entirely: a waitlist spot is not a purchase (ADR-824).
      if (billingOn && !free && !full) {
        warmStripeBrowser()
        const checkout = await startSpaceMembershipCheckout(
          spaceId,
          tierId,
          price.cadence === 'year' ? 'year' : 'month',
        )
        if (!isError(checkout)) {
          // 🔴 Branch on what CAME BACK, never on what was asked for: the server declines the
          // on-page path whenever it cannot be honoured, and hands back a hosted URL instead.
          if (checkout.data.clientSecret) {
            setSession({
              cadence: price.cadence,
              clientSecret: checkout.data.clientSecret,
              sessionId: checkout.data.sessionId ?? null,
            })
            setOpen(true)
            return
          }
          if (checkout.data.url) {
            window.location.href = checkout.data.url
            return
          }
        }
        // 🔴 NOT EVERY NO-OP IS A FALLBACK (LIVE-233). `no_owner_payouts` means the space owner has
        // no onboarded Stripe account, and falling through to joinTier handed the member a PAID tier
        // FOR FREE, silently, with the operator never learning their tier was being given away.
        if (isError(checkout) && checkout.error === 'no_owner_payouts') {
          setError('This space cannot take payment yet. Follow it to hear when joining opens.')
          return
        }
        // 🔴 NOR IS A MISSING YEARLY PRICE (ADR-1374). Falling through would record a membership for
        // a cadence this tier does not sell, so it says so and stops.
        if (isError(checkout) && checkout.error === 'no_annual_price') {
          setError('This tier is monthly only. Switch the toggle to monthly to join it.')
          return
        }
      }
      const result = await joinTier(spaceId, tierId, price.cadence === 'year' ? 'year' : 'month')
      if (isError(result)) {
        setError(result.error)
        return
      }
      if (returnTo) {
        router.push(returnTo)
        return
      }
      router.refresh()
    })
  }

  // ── The pieces, built once and laid out twice ───────────────────────────────────────────────
  // `bar` and `card` differ in ARRANGEMENT, never in behaviour: same join(), same capacity states,
  // same honesty line. Keeping one component is what stops the free tier's row from drifting away
  // from the paid tiers' cards the first time either is touched.

  const priceBlock = (
    <div className="flex items-baseline gap-1.5">
      {free ? (
        <span className="text-stat-sm font-black tabular-nums leading-none text-text">Free</span>
      ) : (
        <>
          <span className="text-stat-sm font-black tabular-nums leading-none text-text">
            {formatPrice(price.cents)}
          </span>
          <span className="text-body-sm text-muted">{intervalLabel(price.cadence)}</span>
        </>
      )}
    </div>
  )

  const benefitList = tier.benefits.length > 0 && (
    <ul className="space-y-2">
      {tier.benefits.map((benefit, i) => (
        <li key={i} className="flex items-start gap-2.5 text-body-sm leading-relaxed text-text">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-success-bg">
            <Check className="h-3 w-3 text-success" aria-hidden />
          </span>
          <span>{benefit}</span>
        </li>
      ))}
    </ul>
  )

  const eventList = includedEvents.length > 0 && (
    <ul className="space-y-2">
      {includedEvents.map((e) => (
        <li key={e.slug} className="flex items-start gap-2.5 text-body-sm leading-relaxed text-text">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-primary-bg">
            <Ticket className="h-3 w-3 text-primary-strong" aria-hidden />
          </span>
          <span>
            Member ticket to{' '}
            <Link href={`/events/${e.slug}`} className="font-medium underline underline-offset-2">
              {e.title}
            </Link>{' '}
            included
          </span>
        </li>
      ))}
    </ul>
  )

  // The CTA carries the set's only solid fill on the featured plan; every other plan is secondary,
  // so the grid has one obvious answer rather than four competing ones (marketing pricing does the
  // same, `variant={featured ? 'primary' : 'secondary'}`).
  // A short "best for" line, which every current pricing guide asks for and which this surface
  // had nowhere to put. DERIVED, not a new field: an operator already writes a description, and
  // asking for a second one-liner per tier is how a tier editor grows a field nobody fills in.
  const bestFor = free
    ? 'For following the house'
    : tier.annualPriceCents != null
      ? 'Monthly or yearly'
      : null

  const ctaVariant = featured || free ? 'primary' : 'secondary'
  const ctaLabel = full
    ? 'Join the waitlist'
    : free
      ? 'Join free'
      : layout === 'band'
        ? `Become a ${tier.name}`
        : `Join ${tier.name}`

  // 1 + 3 (CHECKOUT-HANDOFF §4). The button leads, and it goes QUIET when the drawer is open:
  // Stripe renders its own primary Pay button inside the panel, and two stacked primary buttons is
  // the screen people call confusing. The quiet one stays LIVE and collapses the drawer, because a
  // greyed control that does nothing is worse than no control at all.
  const cta =
    full && !tier.waitlist ? (
      <Button type="button" disabled variant={ctaVariant} className="w-full">
        Full
      </Button>
    ) : (
      <Button
        type="button"
        onClick={open ? () => setOpen(false) : join}
        onPointerEnter={warmStripeBrowser}
        onFocus={warmStripeBrowser}
        onTouchStart={warmStripeBrowser}
        loading={pending}
        aria-expanded={open}
        variant={open ? 'secondary' : ctaVariant}
        className="w-full"
      >
        {open && <ChevronUp className="h-4 w-4" aria-hidden />}
        {ctaLabel}
      </Button>
    )

  // 4 + 6 + 7. The drawer opens BETWEEN the button and everything below it, so the card marks and
  // the footnotes are pushed down rather than swapped out: nothing the reader was looking at
  // disappears at the moment they commit.
  const payDrawer = open && liveSession && (
    <CheckoutPanel
      clientSecret={liveSession.clientSecret}
      priceLabel={formatPrice(price.cents)}
      onFellBack={fallBackToHosted}
      // 🔴 WITHOUT THIS a paid membership has exactly ONE way to become real. confirm() with
      // redirect:'if_required' never navigates on the common card path, so the return_url that
      // carries the webhook's backstop is never visited (CHECKOUT-HANDOFF §6).
      onPaid={
        liveSession.sessionId
          ? () => settleSpaceMembershipAction(liveSession.sessionId as string)
          : undefined
      }
      onClose={() => window.location.reload()}
      doneTitle="You are a member."
      doneBody={`Welcome to ${tier.name}. A receipt is on its way to your email.`}
    />
  )

  const footnotes = (
    <>
      {full && tier.waitlist && (
        <p className="mt-2 text-2xs text-muted">
          This tier is full. Joining adds you to the waitlist; you become a member when a spot opens.
        </p>
      )}
      {!free && !full && (
        <p className="mt-2 text-2xs text-muted">
          {billingOn
            ? 'Join opens secure checkout. You can cancel any time.'
            : 'No payment is taken yet. Paid billing comes later.'}
        </p>
      )}
      {error && (
        <p className="mt-2 text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </>
  )

  const spotsLine = spotsLeft != null && spotsLeft > 0 && (
    <p className="text-2xs text-muted">
      {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
    </p>
  )

  // ── BAR: the free tier, above the grid ──────────────────────────────────────────────────────
  if (layout === 'bar') {
    return (
      <div className="rounded-card border border-border bg-surface px-5 py-5 lift-1 ring-focus">
        <div className="flex flex-col gap-4 @md:flex-row @md:items-center @md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-card-title font-bold leading-tight text-text">{tier.name}</h3>
              {priceBlock}
            </div>
            {tier.description && (
              <p className="mt-2 max-w-prose text-body-sm leading-relaxed text-muted">
                {tier.description}
              </p>
            )}
          </div>
          <div className="shrink-0 @md:w-56">
            {spotsLine}
            {cta}
            {payDrawer}
            {footnotes}
          </div>
        </div>
        {tier.benefits.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4">
            {tier.benefits.map((benefit, i) => (
              <li key={i} className="flex items-start gap-2 text-body-sm text-muted">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // ── BAND: the prestige rung, under the grid, as a dark room ─────────────────────────────────
  // A prestige tier listing seven bullets is arguing it is worth 2.5x the tier above it, and per
  // bullet it never is. So it stops arguing. It changes REGISTER instead: the ink ground is the
  // system's own dark band (globals.css calls it "deep warm near-black ... drawn from Frequency's
  // black wood-slat interiors"), it carries three lines rather than a list, and it leads with what
  // the rate does for other people, which is the only reason anyone takes it.
  if (layout === 'band') {
    return (
      <div className="overflow-hidden rounded-card bg-ink px-6 py-10 lift-2 ring-focus @md:px-10 @md:py-12">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
          <div>
            <p className="eyebrow text-on-ink-subtle">By invitation, and by choice</p>
            <h3 className="mt-3 font-section text-display-card font-bold leading-tight text-on-ink">
              {tier.name}
            </h3>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="text-stat-md font-black tabular-nums leading-none text-on-ink">
              {formatPrice(price.cents)}
            </span>
            <span className="text-body-sm text-on-ink-muted">{intervalLabel(price.cadence)}</span>
          </div>

          {tier.description && (
            <p className="max-w-prose text-body leading-relaxed text-on-ink-muted">
              {tier.description}
            </p>
          )}

          {tier.benefits.length > 0 && (
            <ul className="flex flex-col items-center gap-3 border-t border-ink-border pt-6">
              {tier.benefits.map((benefit, i) => (
                <li key={i} className="text-body leading-relaxed text-on-ink">
                  {benefit}
                </li>
              ))}
            </ul>
          )}

          <div className="w-full max-w-xs">
            {spotsLine}
            {cta}
            {payDrawer}
            {footnotes}
          </div>
        </div>
      </div>
    )
  }

  // ── CARD: a paid plan in the grid ───────────────────────────────────
  // The featured plan carries a PRIMARY HEADER BAND rather than a heavier outline. A border says
  // "this one is different"; a filled header says "start here", and it survives being scanned at
  // arm's length, which an outline does not. It also frees the badge from floating on the border,
  // where it collided with the card above it once the grid started stacking.
  //
  // Everything else keeps lift-1 and a hairline. lift-3 is never a plan card: it is reserved for
  // one object per page.
  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-card ring-focus ${
        featured
          ? 'border-2 border-primary bg-surface lift-2'
          : 'border border-border bg-surface lift-1'
      }`}
    >
      {featured && (
        <div className="flex items-center justify-between gap-2 bg-primary px-5 py-2.5">
          <span className="text-body-sm font-bold text-on-primary">Most chosen</span>
          <Check className="h-4 w-4 shrink-0 text-on-primary" aria-hidden />
        </div>
      )}

      <div className={`flex flex-1 flex-col ${featured ? 'p-6' : 'p-5'}`}>
        <h3 className="font-section text-card-title font-bold leading-tight text-text">
          {tier.name}
        </h3>
        {bestFor && <p className="mt-1 text-meta text-subtle">{bestFor}</p>}

        <div className="mt-3">{priceBlock}</div>
        {saving && <p className="mt-1.5 text-2xs font-semibold text-success">{saving}</p>}
        {price.monthlyOnly && (
          <p className="mt-1.5 text-meta text-muted">Monthly only. This tier has no yearly price.</p>
        )}

        {tier.description && (
          <p className="mt-3 text-body-sm leading-relaxed text-muted">{tier.description}</p>
        )}

        {(benefitList || eventList) && (
          <div className="mt-5 space-y-2 border-t border-border pt-5">
            {benefitList}
            {eventList}
          </div>
        )}

        <div className="mt-auto pt-5">
          {spotsLine}
          {cta}
          {payDrawer}
          {footnotes}
        </div>
      </div>
    </div>
  )
}
