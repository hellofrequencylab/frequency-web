// THE GIFT RECEIPT AND THE FUND NOTICE (LIVE-344). Both halves of a settled Space donation.
//
// `recordSpaceDonationFromSession` flipped the gift to `succeeded` and booked the platform fee, and
// nobody heard anything. A donation is the money path with the LEAST other evidence that it
// happened: there is no order to open, no ticket to hold, no membership that changes. The receipt is
// the whole artifact.
//
// TWO READERS, ONE OF WHOM MAY HAVE NO ACCOUNT. Giving needs no account
// (lib/billing/space-donation-checkout.ts), so the donor may be signed out and known only by the
// address Stripe collected. That address goes straight to the outbox, where `sendRawEmail` still
// checks suppression at drain time, exactly as the guest ticket receipt does. The Space's own notice
// always has a profile behind it: the owner.
//
// IDEMPOTENCY IS THE CALLER'S: the settle only reaches here for a row THIS delivery flipped
// `pending` -> `succeeded`.

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl } from './stripe'
import {
  displayNameFor,
  notifyEarner,
  receiptAmount,
  receiptDate,
  sendMoneyReceipt,
  spaceReceiptTarget,
} from './receipt-email'

const LOG = '[space-donation receipt]'

/** The `notifications.type` a Space owner's gift notice carries. */
export const DONATION_RECEIVED_NOTIFICATION_TYPE = 'space_donation_received'

/** A donor with no account is still a person who gave. */
const ANONYMOUS_DONOR = 'Someone'

/** The settled gift, as the webhook holds it. */
export interface SettledDonation {
  id: string
  spaceId: string
  askId: string | null
  donorProfileId: string | null
  amountCents: number
  currency: string | null
  message: string | null
  /** The address Stripe collected, the only way to reach a signed-out donor. */
  donorEmail?: string | null
}

/** What the fund is called, or a plain fallback. Best-effort. */
async function fundLabel(askId: string | null): Promise<string> {
  if (!askId) return 'the fund'
  try {
    const { data, error } = await createAdminClient()
      .from('space_donation_asks')
      .select('fund_label')
      .eq('id', askId)
      .maybeSingle()
    if (error) {
      console.warn(`${LOG} fund label unreadable`, { askId, error: error.message })
      return 'the fund'
    }
    return ((data as { fund_label?: string | null } | null)?.fund_label ?? '').trim() || 'the fund'
  } catch {
    return 'the fund'
  }
}

/**
 * Tell the donor their gift went through, and tell the Space it arrived.
 *
 * BEST-EFFORT ON EVERY PATH; every failure is logged. Resolves void on every path.
 */
export async function sendDonationReceipts(gift: SettledDonation): Promise<void> {
  try {
    const amount = receiptAmount(gift.amountCents, gift.currency)
    const space = await spaceReceiptTarget(gift.spaceId)
    if (!space) {
      console.error(`${LOG} space not found; nobody was told about a settled gift`, {
        donationId: gift.id,
        spaceId: gift.spaceId,
      })
      return
    }
    const fund = await fundLabel(gift.askId)
    const when = receiptDate()
    const note = gift.message?.trim() || null
    const spaceUrl = `${appUrl()}/spaces/${space.slug}`

    // ── The donor's receipt ──────────────────────────────────────────────────────────────────
    await sendMoneyReceipt({
      to: gift.donorEmail ?? null,
      profileId: gift.donorProfileId,
      subject: `Your gift to ${space.name}`,
      content: {
        greetingName: await displayNameFor(gift.donorProfileId),
        lead: amount
          ? `Your ${amount} gift to ${fund} at ${space.name} went through.`
          : `Your gift to ${fund} at ${space.name} went through.`,
        lines: [
          { label: 'Fund', value: fund },
          { label: 'Space', value: space.name },
          { label: 'Amount', value: amount ?? '' },
          { label: 'Date', value: when },
          { label: 'Your note', value: note ?? '' },
        ],
        closing: [
          `The gift goes to ${space.name}. Keep this email as your record of it.`,
          'This is a gift, not a purchase, so nothing is being shipped and nothing renews.',
        ],
        actionLabel: `Go to ${space.name}`,
        actionUrl: spaceUrl,
      },
      logTag: LOG,
      context: { donationId: gift.id, side: 'donor' },
    })

    // ── The Space's notice ───────────────────────────────────────────────────────────────────
    if (!space.ownerProfileId) {
      console.error(`${LOG} space has no owner; the gift notice was NOT sent`, {
        donationId: gift.id,
        spaceId: gift.spaceId,
      })
      return
    }
    const donorName = (await displayNameFor(gift.donorProfileId)) ?? ANONYMOUS_DONOR
    await notifyEarner({
      recipientProfileId: space.ownerProfileId,
      actorProfileId: gift.donorProfileId,
      type: DONATION_RECEIVED_NOTIFICATION_TYPE,
      referenceType: 'space',
      referenceId: space.slug,
      bellBody: amount ? `gave ${amount} to ${fund}` : `gave to ${fund}`,
      bellBodyNoActor: amount
        ? `${ANONYMOUS_DONOR} gave ${amount} to ${fund}`
        : `${ANONYMOUS_DONOR} gave to ${fund}`,
      subject: amount ? `${donorName} gave ${amount} to ${fund}` : `${donorName} gave to ${fund}`,
      content: {
        greetingName: await displayNameFor(space.ownerProfileId),
        lead: amount
          ? `${donorName} gave ${amount} to ${fund} at ${space.name}.`
          : `${donorName} gave to ${fund} at ${space.name}.`,
        lines: [
          { label: 'Fund', value: fund },
          { label: 'From', value: donorName },
          { label: 'Amount', value: amount ?? '' },
          { label: 'Date', value: when },
          { label: 'Their note', value: note ?? '' },
        ],
        closing: [
          'The gift goes to your payout account on your usual payout schedule.',
          'Nothing is owed in return. A gift buys nothing, so there is no order to fill.',
        ],
        actionLabel: `Go to ${space.name}`,
        actionUrl: spaceUrl,
      },
      logTag: LOG,
      context: { donationId: gift.id, side: 'space' },
    })
  } catch (err) {
    console.error(`${LOG} donation receipts failed`, { donationId: gift.id, err })
  }
}
