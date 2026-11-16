import { DonateForm } from '@/components/spaces/donations/donate-form'
import { formatPriceCents } from '@/lib/commerce/types'
import { huntGiftTotals, openDonationAsk } from '@/lib/hunts/donation-sync'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { HuntDonationAsk } from './hunt-donation-ask'

// THE TRAIL'S GIVING SECTION (FH-046S). Renders nothing unless HUNTS_COMMERCE_ENABLED is on AND the
// Trail's ask carries a recorded approval (the D8 sign-off, FH-045) AND the beneficiary can take a gift.
// The control is the Space donation form itself, so the charge, the card panel and the receipt are the
// ones every Space fund already uses. Giving never changes a run: nothing here reads or writes one.
export function HuntFundraising({ huntId }: { huntId: string }) {
  // Synchronous on purpose: with the switch off the page gets a plain null and no async work at all.
  if (!huntSwitchOn('commerce')) return null
  return <OpenAsk huntId={huntId} />
}

async function OpenAsk({ huntId }: { huntId: string }) {
  const ask = await openDonationAsk(huntId)
  if (!ask) return null
  const totals = await huntGiftTotals(ask.askId).catch(() => [])

  return (
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
  )
}
