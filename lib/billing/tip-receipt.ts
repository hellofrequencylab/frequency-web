// THE TIPPER'S RECEIPT (LIVE-344). The other half of lib/billing/tips-notify.ts.
//
// Tips were the only silent loop that was HALF built: since 2026-09-05 the recipient gets a bell and
// an email (notifyTipRecipient). The person whose card was charged got nothing, which is the wrong
// half to have. A tip is the one money path with no object behind it, no order, no ticket, no
// membership, so the payer's only possible record is this message.
//
// 🔴 THIS FILE IS THE TIPPER'S SIDE AND ONLY THE TIPPER'S SIDE. The recipient's side lives in
// lib/billing/tips-notify.ts and is untouched. Two files, two readers, one flip in
// `recordTipFromSession` that calls both.
//
// IDEMPOTENCY IS THE CALLER'S: the settle only reaches here for a row THIS delivery flipped
// `pending` -> `succeeded`.

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl } from './stripe'
import { displayNameFor, receiptAmount, receiptDate, sendMoneyReceipt } from './receipt-email'

const LOG = '[tip receipt]'

/** The settled tip, as the recorder holds it (the same row shape notifyTipRecipient takes). */
export interface SettledTip {
  id: string
  to_profile_id: string
  from_profile_id: string | null
  amount_cents: number
  currency: string
  message: string | null
}

/** The recipient's handle, so the receipt can link back to the person who was tipped. */
async function recipientHandle(profileId: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('profiles')
      .select('handle')
      .eq('id', profileId)
      .maybeSingle()
    if (error) {
      console.warn(`${LOG} recipient handle unreadable`, { profileId, error: error.message })
      return null
    }
    return (data as { handle?: string | null } | null)?.handle ?? null
  } catch {
    return null
  }
}

/**
 * Email the tipper the record of the tip they just sent.
 *
 * BEST-EFFORT ON EVERY PATH; every failure is logged. A tip sent by a member who has since lost
 * their address still leaves a log line naming the tip. Resolves void on every path.
 */
export async function sendTipperReceipt(tip: SettledTip): Promise<void> {
  try {
    if (!tip.from_profile_id) {
      // A tip with no sender has nobody to receipt. Not an error: the tips table allows it, and the
      // recipient's side already handles that case by name.
      return
    }
    const amount = receiptAmount(tip.amount_cents, tip.currency)
    const recipientName = (await displayNameFor(tip.to_profile_id)) ?? 'them'
    const handle = await recipientHandle(tip.to_profile_id)
    const note = tip.message?.trim() || null

    await sendMoneyReceipt({
      profileId: tip.from_profile_id,
      subject: amount ? `Your ${amount} tip to ${recipientName}` : `Your tip to ${recipientName}`,
      content: {
        greetingName: await displayNameFor(tip.from_profile_id),
        lead: amount
          ? `Your ${amount} tip to ${recipientName} went through.`
          : `Your tip to ${recipientName} went through.`,
        lines: [
          { label: 'To', value: recipientName },
          { label: 'Amount', value: amount ?? '' },
          { label: 'Date', value: receiptDate() },
          { label: 'Your note', value: note ?? '' },
        ],
        closing: [
          `Frequency takes nothing from a tip. The whole amount goes to ${recipientName}.`,
          'A tip is one time. Nothing renews and nothing is owed back.',
        ],
        actionLabel: handle ? `Go to ${recipientName}` : null,
        actionUrl: handle ? `${appUrl()}/people/${handle}` : null,
      },
      logTag: LOG,
      context: { tipId: tip.id },
    })
  } catch (err) {
    console.error(`${LOG} tipper receipt failed`, { tipId: tip.id, err })
  }
}
