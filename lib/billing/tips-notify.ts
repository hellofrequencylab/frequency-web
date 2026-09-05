// Tips: the recipient's side (scan2 L9-05). Until 2026-09-05 a tip's life ended at the webhook
// flip: the row went `succeeded`, the fee was booked, and the person who received the money was
// never told and had nowhere to see it. Their Stripe payout was the only signal. This module is
// the recipient's half: notifyTipRecipient (bell + email, called once per succeeded flip from
// lib/billing/tips.ts recordTipFromSession) and listTipsReceived (the reader behind the "Tips
// received" section of Settings). Server-only: it opens the service-role client.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { formatPriceCents } from '@/lib/commerce/types'

/** The columns the succeed path selects back off the flipped row. Everything the notifier needs
 *  rides on the row itself, so a redelivered webhook cannot notify twice: the flip returns zero
 *  rows the second time and this is never called. */
export interface SucceededTip {
  id: string
  to_profile_id: string
  from_profile_id: string | null
  amount_cents: number
  currency: string
  message: string | null
}

/** The tipper's display name, or "Someone" when the tip carries no sender. The tips table has no
 *  anonymity flag today; a null from_profile_id is the only anonymity a tip can carry, and it is
 *  honoured the same way everywhere the name is shown. */
export const ANONYMOUS_TIPPER = 'Someone'

export const TIP_NOTIFICATION_TYPE = 'tip_received'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Never throws: a notification is a courtesy, and the money has already moved. */
export async function notifyTipRecipient(tip: SucceededTip): Promise<void> {
  const admin = createAdminClient()
  const amount = formatPriceCents(tip.amount_cents, tip.currency)

  let tipperName: string = ANONYMOUS_TIPPER
  if (tip.from_profile_id) {
    const { data: tipper, error } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', tip.from_profile_id)
      .maybeSingle()
    if (error) console.error('[tips] tipper lookup failed', { tipId: tip.id, error: error.message })
    if (tipper?.display_name) tipperName = tipper.display_name
  }

  // 1. The bell. The bell renders the actor's name in front of `body`, so with a sender the row
  //    reads "<name> sent you a $5 tip"; without one there is no actor and the body carries the
  //    whole sentence. reference_type 'profile' resolves to the sender's page through the actor's
  //    handle, and to the member index when there is no sender.
  const { error: bellErr } = await admin.from('notifications').insert({
    recipient_id: tip.to_profile_id,
    actor_id: tip.from_profile_id,
    type: TIP_NOTIFICATION_TYPE,
    reference_type: 'profile',
    reference_id: tip.from_profile_id,
    body: tip.from_profile_id
      ? `sent you a ${amount} tip`
      : `${ANONYMOUS_TIPPER} sent you a ${amount} tip`,
  })
  if (bellErr) console.error('[tips] recipient notification insert failed', { tipId: tip.id, error: bellErr.message })

  // 2. Email, through the durable outbox. Money that landed in your account is transactional
  //    mail: only the suppression list can stop it, and the address is resolved first so the gate
  //    can see it.
  try {
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('display_name, auth_user_id')
      .eq('id', tip.to_profile_id)
      .maybeSingle()
    if (profileErr) {
      console.error('[tips] recipient lookup failed', { tipId: tip.id, error: profileErr.message })
      return
    }
    if (!profile?.auth_user_id) return
    const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
    if (!user?.email) return
    if (!(await resolveSendGate(tip.to_profile_id, 'email', 'transactional', { email: user.email })).allowed) return

    const recipientName = profile.display_name ?? 'there'
    const subject = `${tipperName} sent you a ${amount} tip`
    const note = tip.message?.trim() || null
    await enqueueEmail({
      to: user.email,
      subject,
      html: tipEmailHtml({ recipientName, tipperName, amount, note }),
      text: tipEmailText({ recipientName, tipperName, amount, note }),
    })
  } catch (err) {
    console.error('[tips] recipient email failed', { tipId: tip.id, err })
  }
}

// Email HTML, not UI chrome: mail clients read no design tokens, so the palette is the same
// literal ink / muted / rule values lib/email.ts uses for every other transactional email.
const EMAIL_INK = '#3D352A' // token-ok: email HTML, mirrors lib/email.ts
const EMAIL_MUTED = '#6B6253' // token-ok: email HTML, mirrors lib/email.ts
const EMAIL_RULE = '#E9E1D4' // token-ok: email HTML, mirrors lib/email.ts
const EMAIL_P = `font-size:15px;line-height:1.6;margin:0 0 20px;`

function tipEmailHtml(p: { recipientName: string; tipperName: string; amount: string; note: string | null }): string {
  const noteBlock = p.note
    ? `<p style="${EMAIL_P}color:${EMAIL_MUTED};border-left:3px solid ${EMAIL_RULE};padding-left:12px;">${escapeHtml(p.note)}</p>`
    : ''
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;">
<p style="${EMAIL_P}color:${EMAIL_INK};">Hi ${escapeHtml(p.recipientName)},</p>
<p style="${EMAIL_P}color:${EMAIL_INK};"><strong>${escapeHtml(p.tipperName)}</strong> sent you a <strong>${escapeHtml(p.amount)}</strong> tip on Frequency.</p>
${noteBlock}
<p style="${EMAIL_P}color:${EMAIL_MUTED};">Frequency takes nothing from a tip. The full amount goes to your connected payout account and lands on your usual payout schedule.</p>
</div>`
}

function tipEmailText(p: { recipientName: string; tipperName: string; amount: string; note: string | null }): string {
  const lines = [
    `Hi ${p.recipientName},`,
    '',
    `${p.tipperName} sent you a ${p.amount} tip on Frequency.`,
  ]
  if (p.note) lines.push('', `"${p.note}"`)
  lines.push(
    '',
    'Frequency takes nothing from a tip. The full amount goes to your connected payout account and lands on your usual payout schedule.',
  )
  return lines.join('\n')
}

// ── The reader ─────────────────────────────────────────────────────────────────────────────────

export interface TipReceived {
  id: string
  amountCents: number
  currency: string
  message: string | null
  /** The tipper's display name, or "Someone" when the tip carries no sender. */
  tipperName: string
  succeededAt: string | null
}

export interface TipsReceived {
  /** Sum of every succeeded tip, not only the ones listed. */
  totalCents: number
  count: number
  /** The most recent succeeded tips, newest first. */
  recent: TipReceived[]
}

/** Every succeeded tip a member has received, totalled, with the most recent listed. A refunded
 *  tip is not "received" and is left out of both. Reads its errors: a failed read returns an
 *  empty result rather than a lie about a zero balance, and logs why. */
export async function listTipsReceived(profileId: string, limit = 10): Promise<TipsReceived> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tips')
    .select('id, amount_cents, currency, message, from_profile_id, succeeded_at')
    .eq('to_profile_id', profileId)
    .eq('status', 'succeeded')
    .order('succeeded_at', { ascending: false })
  if (error) {
    console.error('[tips] tips received read failed', { profileId, error: error.message })
    return { totalCents: 0, count: 0, recent: [] }
  }
  const rows = (data ?? []) as {
    id: string
    amount_cents: number
    currency: string
    message: string | null
    from_profile_id: string | null
    succeeded_at: string | null
  }[]

  const tipperIds = [...new Set(rows.map((r) => r.from_profile_id).filter((id): id is string => !!id))]
  const names = new Map<string, string>()
  if (tipperIds.length) {
    const { data: tippers, error: tipperErr } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', tipperIds)
    if (tipperErr) console.error('[tips] tipper names read failed', { profileId, error: tipperErr.message })
    for (const t of tippers ?? []) if (t.display_name) names.set(t.id, t.display_name)
  }

  return {
    totalCents: rows.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0),
    count: rows.length,
    recent: rows.slice(0, limit).map((r) => ({
      id: r.id,
      amountCents: r.amount_cents,
      currency: r.currency,
      message: r.message,
      tipperName: (r.from_profile_id && names.get(r.from_profile_id)) || ANONYMOUS_TIPPER,
      succeededAt: r.succeeded_at,
    })),
  }
}
