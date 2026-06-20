import { HeartHandshake } from 'lucide-react'
import { getDonationAsk } from '@/lib/spaces/donations'
import { EmptyState } from '@/components/ui/empty-state'
import { DonateCtaTracker } from '@/components/spaces/donations/donate-cta-tracker'

// MEMBER DONATE SURFACE (ENTITY-SPACES-SYSTEM §2.6 "Donate", MASTER-PLAN ADMIN-04). The self-fetching
// server half of the Organization "Donate" tab: it loads this Space's single active donation ask
// (fund label, description, suggested amounts) and renders it as a real Donate card. When the owner
// has not published an ask, an EmptyState names the situation and the next step. Server-first; the
// fetch sits behind a <Suspense> in the caller (entity-cta) so the tab paints instantly
// (PAGE-FRAMEWORK §5).
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes NO payment. There is no Stripe path and giving is
// not wired up yet, so the suggested amounts are a preview of what the owner plans to ask for. The
// copy says so plainly, with no narrated feelings and no em/en dashes (CONTENT-VOICE §10).

/** Cents to a plain dollar chip label, e.g. 2500 -> "$25", 2550 -> "$25.50". Whole dollars drop the
 *  cents. USD only in v1 (a currency column is a later, additive expansion). DISPLAY ONLY. */
export function formatAmount(cents: number): string {
  const dollars = cents / 100
  const whole = Number.isInteger(dollars)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

export async function DonateMember({ spaceId }: { spaceId: string }) {
  const ask = await getDonationAsk(spaceId)

  if (!ask) {
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
      {ask.id && <DonateCtaTracker spaceId={spaceId} />}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="text-base font-bold leading-tight text-text">{ask.fundLabel}</h3>
        {ask.description && (
          <p className="mt-2 text-sm leading-relaxed text-muted">{ask.description}</p>
        )}

        {ask.suggestedAmountsCents.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-text">Suggested amounts</p>
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Suggested gift amounts">
              {ask.suggestedAmountsCents.map((cents) => (
                <li
                  key={cents}
                  className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-semibold text-text"
                >
                  {formatAmount(cents)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="text-2xs text-subtle">
        Giving is not wired up yet, so these amounts are a preview of what this fund plans to ask for.
        We do not take a payment. Follow this space to hear when giving opens.
      </p>
    </div>
  )
}
