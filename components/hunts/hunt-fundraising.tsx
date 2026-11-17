import { DonateForm } from '@/components/spaces/donations/donate-form'
import { formatPriceCents } from '@/lib/commerce/types'
import { huntGiftTotals, openDonationAsk } from '@/lib/hunts/donation-sync'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { sponsorMoneyLines } from '@/lib/hunts/sponsor-settlement'
import { HuntDonationAsk } from './hunt-donation-ask'

// THE TRAIL'S GIVING SECTION (FH-046S, FH-047S). Renders nothing unless HUNTS_COMMERCE_ENABLED is on AND
// there is an approved record behind what it shows (the D8 sign-off, FH-045): an ask with an approver and
// a beneficiary that can take a gift, or an active sponsor agreement with an approver.
// The control is the Space donation form itself, so the charge, the card panel and the receipt are the
// ones every Space fund already uses. Giving never changes a run: nothing here reads or writes one.
// Gifts received, a sponsor pledge and a sponsor payment are three separate lines and are never summed.
export function HuntFundraising({ huntId }: { huntId: string }) {
  // Synchronous on purpose: with the switch off the page gets a plain null and no async work at all.
  if (!huntSwitchOn('commerce')) return null
  return <OpenFundraising huntId={huntId} />
}

async function OpenFundraising({ huntId }: { huntId: string }) {
  const ask = await openDonationAsk(huntId)
  const totals = ask ? await huntGiftTotals(ask.askId).catch(() => []) : []
  const raisedUsd = totals.find((t) => t.currency === 'USD')?.raisedMinor ?? 0
  const sponsor = await sponsorMoneyLines(huntId, raisedUsd).catch(() => null)
  const sponsorOwes = sponsor && sponsor.sponsorPledgedCents > 0
  const sponsorPaid = sponsor && sponsor.sponsorPaidCents > 0
  if (!ask && !sponsorOwes && !sponsorPaid) return null

  return (
    <>
      {ask && (
        <HuntDonationAsk beneficiaryName={ask.beneficiaryName} purpose={ask.purpose} enabled>
          <DonateForm
            spaceId={ask.beneficiarySpaceId}
            suggestedAmountsCents={ask.suggestedAmountsCents}
            idPrefix={`trail-gift-${huntId}`}
            huntId={huntId}
          />
          {totals
            .filter((t) => t.settledCount > 0)
            .map((t) => (
              <p key={t.currency} className="text-body-sm text-muted">
                {formatPriceCents(t.raisedMinor, t.currency)} received from {t.settledCount} {t.settledCount === 1 ? 'gift' : 'gifts'} so far, after refunds.
              </p>
            ))}
        </HuntDonationAsk>
      )}
      {sponsor && (sponsorOwes || sponsorPaid) && (
        <section aria-label="Sponsor pledge" className="space-y-1 rounded-card border border-border bg-surface p-4">
          <h2 className="text-body font-semibold">Sponsor pledge</h2>
          {sponsorPaid && (
            <p className="text-body-sm text-muted">
              {sponsor.sponsorLabel} has paid {formatPriceCents(sponsor.sponsorPaidCents, sponsor.currency)}.
            </p>
          )}
          {sponsorOwes && (
            <p className="text-body-sm text-muted">
              {sponsor.sponsorLabel} has pledged {formatPriceCents(sponsor.sponsorPledgedCents, sponsor.currency)}. It is not paid yet, so it is not counted in gifts received.
            </p>
          )}
        </section>
      )}
    </>
  )
}
