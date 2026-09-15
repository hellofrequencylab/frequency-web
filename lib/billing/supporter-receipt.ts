// THE CONTRIBUTOR'S RECEIPT (LIVE-344). The one-off Supporter contribution had no reader at all:
// `recordSupporterContributionFromSession` flipped the row, booked the Foundation donation and
// turned the badge on, and the person who paid was told nothing anywhere.
//
// There is no second party here. A supporter contribution is a direct platform payment, not a
// Connect destination charge, so Frequency is the recipient and there is no earner to notify. One
// half only.
//
// NAMING CARE (docs/NAMING.md, the tier-ladder entry). "Contribute" is overloaded on purpose and the
// two senses must stay legible in one message: a *contribution* in THIS sense is a one-off gift that
// buys nothing, while *contribute what you want* is how a Crew membership is priced. This copy says
// the gift buys nothing and never touches the Crew pricing frame.
//
// IDEMPOTENCY IS THE CALLER'S: the settle only reaches here for a row THIS delivery flipped
// `pending` -> `succeeded`.

import 'server-only'

import { appUrl } from './stripe'
import { displayNameFor, receiptAmount, receiptDate, sendMoneyReceipt } from './receipt-email'

const LOG = '[supporter receipt]'

/** The settled contribution, as the recorder holds it. */
export interface SettledContribution {
  id: string
  profileId: string | null
  amountCents: number
  currency: string | null
}

/**
 * Email the contributor the record of what they gave.
 *
 * BEST-EFFORT ON EVERY PATH; every failure is logged. Resolves void on every path.
 */
export async function sendSupporterContributionReceipt(contribution: SettledContribution): Promise<void> {
  try {
    if (!contribution.profileId) {
      console.error(`${LOG} contribution has no profile; the receipt was NOT emailed`, {
        contributionId: contribution.id,
      })
      return
    }
    const amount = receiptAmount(contribution.amountCents, contribution.currency)
    await sendMoneyReceipt({
      profileId: contribution.profileId,
      subject: 'Your contribution to Frequency',
      content: {
        greetingName: await displayNameFor(contribution.profileId),
        lead: amount
          ? `Your ${amount} contribution to Frequency went through.`
          : 'Your contribution to Frequency went through.',
        lines: [
          { label: 'Amount', value: amount ?? '' },
          { label: 'Date', value: receiptDate() },
          { label: 'One time', value: 'Yes. Nothing renews.' },
        ],
        closing: [
          'A contribution buys nothing extra. It funds the build, and the Supporter mark is now on your profile.',
          'Keep this email as your record of it.',
        ],
        actionLabel: 'Go to Plan and billing',
        actionUrl: `${appUrl()}/settings/billing`,
      },
      logTag: LOG,
      context: { contributionId: contribution.id },
    })
  } catch (err) {
    console.error(`${LOG} contribution receipt failed`, { contributionId: contribution.id, err })
  }
}
