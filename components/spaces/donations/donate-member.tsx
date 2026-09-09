import { HeartHandshake } from 'lucide-react'
import { getDonationAsk } from '@/lib/spaces/donations'
import { viewerManagesSpace } from '@/lib/spaces/operator'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminSetupPrompt } from '@/components/spaces/admin-setup-prompt'
import { DonateCtaTracker } from '@/components/spaces/donations/donate-cta-tracker'
import { PriceInput } from '@/components/commerce/price-input'
import { DonateForm } from '@/components/spaces/donations/donate-form'
import { spaceCanTakeDonations } from '@/lib/billing/space-donation-checkout'
import { formatPriceCents, type Price } from '@/lib/commerce/types'

// MEMBER DONATE SURFACE (ENTITY-SPACES-SYSTEM §2.6 "Donate", MASTER-PLAN ADMIN-04). The self-fetching
// server half of the Organization "Donate" tab: it loads this Space's single active donation ask
// (fund label, description, suggested amounts) and renders it as a real Donate card. When the owner
// has not published an ask, an EmptyState names the situation and the next step. Server-first; the
// fetch sits behind a <Suspense> in the caller (entity-cta) so the tab paints instantly
// (PAGE-FRAMEWORK §5).
//
// GIVING IS WIRED (LIVE-235). The paragraph that stood here said "v1 takes NO payment. There is no
// Stripe path and giving is not wired up yet", and that was honest for as long as it was true. It is
// not any more: lib/billing/space-donation-checkout.ts opens a Stripe Connect destination charge to
// the space owner, so this card renders a real Give button whenever the fund can actually take one.
//
// HONESTY IS STILL THE RULE, it just has a new subject (CONTENT-VOICE skeptic test). The card asks
// spaceCanTakeDonations first, and a fund whose owner has no payout account keeps the preview copy
// rather than showing a button that resolves to a refusal. The OPERATOR gets the shared Connect
// prompt on their Offerings surface (LIVE-233), which is where that gap gets closed. No em dashes.

/** Cents to a plain dollar chip label, e.g. 2500 -> "$25", 2550 -> "$25.50". Whole dollars drop the
 *  cents. USD only in v1 (a currency column is a later, additive expansion). DISPLAY ONLY. */
export function formatAmount(cents: number): string {
  // The ONE house price format (lib/commerce/types.ts); this was a verbatim copy of it. ⚠️ Nothing
  // calls this export today (B5 sweep, 2026-09-04): the chips render through PriceInput, which
  // formats for itself. Kept only so the deletion is a separate, visible decision.
  return formatPriceCents(cents)
}

export async function DonateMember({
  spaceId,
  slug,
  ownerProfileId,
}: {
  spaceId: string
  slug: string
  ownerProfileId: string | null
}) {
  // Both reads run together: the ask is what to render, and the readiness is whether the Give button
  // may exist at all (a fund whose owner has no payout account keeps the preview control).
  const [ask, canGive] = await Promise.all([getDonationAsk(spaceId), spaceCanTakeDonations(spaceId)])

  // The fund as a `choose` + donation offer (Pricing Options P2). This is now the FALLBACK control,
  // rendered only when the fund cannot take a gift: it shows the choice without charging, which is
  // the honest thing to render when there is no payout account behind the button.
  const donationPrice: Price = {
    mode: 'choose',
    donation: true,
    pickAmountsCents: ask?.suggestedAmountsCents.length ? ask.suggestedAmountsCents : undefined,
  }

  if (!ask) {
    // OPERATOR (owner / admin / editor): guide them to set up the fund instead of the member empty state.
    if (await viewerManagesSpace({ id: spaceId, ownerProfileId })) {
      return (
        <AdminSetupPrompt
          icon={HeartHandshake}
          title="Your button opens giving, but there is no fund yet."
          description="Set up your fund and the amounts supporters can pick. You can also change what your button opens."
          links={[
            { href: `/spaces/${slug}/settings/offerings#donations`, label: 'Set up your fund' },
            {
              href: `/spaces/${slug}/manage/mode`,
              label: 'Change what your button opens',
              tone: 'secondary',
            },
          ]}
        />
      )
    }
    return (
      <EmptyState
        icon={HeartHandshake}
        title="No fund posted yet."
        description="This space has not set up a fund. Follow it to hear the moment giving opens."
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Record one space.cta_click on mount (Epic 1.11): the Donate engine has no action button yet,
          so this keeps the CTA telemetry the placeholder list used to fire. Fail-safe + fire-and-forget. */}
      {/* 2026-09-05 (scan2 L9-07): no longer on mount. The tracker wraps the amount picker below and
          records the click on the member's first real interaction with it, so a page view is a view
          and a click is a click on the Space Home dashboard. */}
      <div className="rounded-card border border-border bg-surface p-5 lift-1">
        <h3 className="text-body font-bold leading-tight text-text">{ask.fundLabel}</h3>
        {ask.description && (
          <p className="mt-2 text-body-sm leading-relaxed text-muted">{ask.description}</p>
        )}

        <div className="mt-4">
          <p className="text-meta font-semibold text-text">Pick an amount</p>
          <div className="mt-2">
            {/* The REAL buyer control when the fund can take a gift (LIVE-235), and the Pricing
                Options P2 DISPLAY-only picker when it cannot, so a donor is never handed a button
                that resolves to a refusal. */}
            {ask.id ? (
              <DonateCtaTracker spaceId={spaceId}>
                {canGive ? (
                  <DonateForm
                    spaceId={spaceId}
                    suggestedAmountsCents={ask.suggestedAmountsCents}
                    idPrefix={`donate-${spaceId}`}
                  />
                ) : (
                  <PriceInput price={donationPrice} idPrefix={`donate-${spaceId}`} />
                )}
              </DonateCtaTracker>
            ) : (
              <PriceInput price={donationPrice} idPrefix={`donate-${spaceId}`} />
            )}
          </div>
        </div>
      </div>

      {canGive ? (
        <p className="text-2xs text-muted">
          Gifts are handled by Stripe and go straight to this space. You will get a receipt by email.
        </p>
      ) : (
        <p className="text-2xs text-muted">
          This fund is not taking gifts yet, so these amounts are a preview of what it plans to ask
          for. We do not take a payment. Follow this space to hear when giving opens.
        </p>
      )}
    </div>
  )
}
