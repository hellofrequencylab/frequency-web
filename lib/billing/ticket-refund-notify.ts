// A TICKET REFUND TELLS BOTH SIDES (LIVE-2551).
//
// A refunded ticket used to change a row and say nothing. The buyer learned from their bank, days
// later, with no event name on it; the host learned from a smaller payout. A sale already tells the
// host (./ticket-sale-notify.ts); this is the same notice in reverse: an email to the buyer, and a
// bell and an email to whoever was paid.
//
// ONE NOTICE PER REFUND. recordTicketRefund calls this once per row refund_ticket_atomic actually
// flipped, so a redelivered charge.refunded (zero rows the second time) sends nothing, and the email
// dedupe key holds the line if two callers ever race.
//
// A CANCELLED EVENT IS NOT OURS. Cancelling an event queues every refund and writes each buyer its
// own cancellation email (lib/events/cancellation.ts); the host is the one who cancelled. A second
// message from here would be noise, so an event that is cancelled sends nothing.
//
// Never throws: the money has already gone back. Server-only. No em or en dashes.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail, emailShell, EMAIL_INK, EMAIL_MUTED, EMAIL_P } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { isSuppressed } from '@/lib/suppression'
import { profileAccountEmail } from '@/lib/profiles/account-email'
import { formatPriceCents } from '@/lib/commerce/types'
import { ticketCountLabel, ANONYMOUS_BUYER } from './ticket-sale-notify'

export const TICKET_REFUND_NOTIFICATION_TYPE = 'ticket_refunded'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** "ticket" or "2 tickets", with the verb that agrees. PURE. */
function ticketsPhrase(qty: number): { noun: string; were: string } {
  const one = ticketCountLabel(qty) === 'a ticket'
  return one ? { noun: 'ticket', were: 'was' } : { noun: `${Math.floor(qty)} tickets`, were: 'were' }
}

/** What the buyer reads. PURE. */
export function buyerRefundSentence(c: { qty: number; eventTitle: string; amountLabel: string | null }): string {
  const t = ticketsPhrase(c.qty)
  const back = c.amountLabel ? `${c.amountLabel} is` : 'The money is'
  return `Your ${t.noun} to ${c.eventTitle} ${t.were} refunded. ${back} on its way back to the card you paid with. Banks usually show it within 5 to 10 business days.`
}

/** What the host reads, in the bell and the email. PURE. */
export function hostRefundSentence(c: { buyerName: string; qty: number; eventTitle: string; amountLabel: string | null }): string {
  const t = ticketsPhrase(c.qty)
  return `${c.buyerName}’s ${t.noun} to ${c.eventTitle} ${t.were} refunded${c.amountLabel ? ` (${c.amountLabel})` : ''}`
}

function mail(lines: { text: string; muted?: boolean }[], link: { href: string; label: string }): { html: string; text: string } {
  const html = emailShell(
    `\n${lines
      .map((l) => `<p data-fq="${l.muted ? 'fq-muted' : 'fq-p'}" style="${EMAIL_P}color:${l.muted ? EMAIL_MUTED : EMAIL_INK};">${escapeHtml(l.text)}</p>`)
      .join('\n')}\n<p style="${EMAIL_P}color:${EMAIL_INK};"><a href="${link.href}" style="color:${EMAIL_INK};">${escapeHtml(link.label)}</a></p>\n`,
  )
  const text = `${lines.map((l) => l.text).join('\n\n')}\n\n${link.label}: ${link.href}`
  return { html, text }
}

/** Tell the buyer and the payee that a ticket was refunded. Called once per flipped row. */
export async function notifyTicketRefund(ticketId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: t, error: tErr } = await admin
      .from('event_tickets')
      .select('id, event_id, buyer_profile_id, guest_email, qty, amount_cents, currency')
      .eq('id', ticketId)
      .maybeSingle()
    const ticket = t as unknown as {
      id: string
      event_id: string
      buyer_profile_id: string | null
      guest_email: string | null
      qty: number | null
      amount_cents: number | null
      currency: string | null
    } | null
    if (tErr || !ticket) {
      console.error('[tickets] refund notice: ticket unreadable; nobody was told about a refund', { ticketId, error: tErr?.message })
      return
    }
    const { data: e, error: eErr } = await admin
      .from('events')
      .select('title, slug, host_id, host_space_id, is_cancelled')
      .eq('id', ticket.event_id)
      .maybeSingle()
    const ev = e as unknown as {
      title: string
      slug: string
      host_id: string | null
      host_space_id: string | null
      is_cancelled: boolean | null
    } | null
    if (eErr || !ev) {
      console.error('[tickets] refund notice: event unreadable; nobody was told about a refund', { ticketId, error: eErr?.message })
      return
    }
    if (ev.is_cancelled) return

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    const eventUrl = `${appUrl}/events/${ev.slug}`
    const qty = Math.max(1, Number(ticket.qty) || 1)
    const amountLabel =
      typeof ticket.amount_cents === 'number' && ticket.amount_cents > 0
        ? formatPriceCents(ticket.amount_cents, ticket.currency ?? 'usd')
        : null

    // ── The buyer ────────────────────────────────────────────────────────────────────────────
    let buyerName: string = ANONYMOUS_BUYER
    try {
      let to: string | null = null
      let hello = 'Hi,'
      if (ticket.buyer_profile_id) {
        const { data: p } = await admin.from('profiles').select('display_name').eq('id', ticket.buyer_profile_id).maybeSingle()
        const name = (p as { display_name: string | null } | null)?.display_name ?? null
        if (name) {
          buyerName = name
          hello = `Hi ${name},`
        }
        const email = await profileAccountEmail(ticket.buyer_profile_id)
        if (email && (await resolveSendGate(ticket.buyer_profile_id, 'email', 'transactional', { email })).allowed) to = email
      } else if (ticket.guest_email && !(await isSuppressed(ticket.guest_email))) {
        to = ticket.guest_email
      }
      if (to) {
        const body = mail(
          [
            { text: hello },
            { text: buyerRefundSentence({ qty, eventTitle: ev.title, amountLabel }) },
            { text: 'A refunded ticket no longer gets you in.', muted: true },
          ],
          { href: eventUrl, label: 'See the event' },
        )
        await enqueueEmail(
          { to, subject: `Your refund for ${ev.title}`, ...body },
          { dedupeKey: `ticket-refund-buyer:${ticket.id}` },
        )
      } else {
        console.error('[tickets] refund notice: no address to tell the buyer at', { ticketId })
      }
    } catch (err) {
      console.error('[tickets] refund notice: buyer email failed', { ticketId, err })
    }

    // ── Whoever was paid: the hosting Space's owner, or the host ─────────────────────────────
    let hostProfileId: string | null = ev.host_id
    let ordersUrl: string | null = null
    if (ev.host_space_id) {
      const { data: s } = await admin.from('spaces').select('owner_profile_id, slug').eq('id', ev.host_space_id).maybeSingle()
      const space = s as { owner_profile_id: string | null; slug: string | null } | null
      hostProfileId = space?.owner_profile_id ?? null
      ordersUrl = space?.slug ? `${appUrl}/spaces/${space.slug}/settings/shop?tab=orders` : null
    }
    if (!hostProfileId) return

    const { error: bellErr } = await admin.from('notifications').insert({
      recipient_id: hostProfileId,
      actor_id: null,
      type: TICKET_REFUND_NOTIFICATION_TYPE,
      reference_type: 'event',
      reference_id: ticket.event_id,
      body: hostRefundSentence({ buyerName, qty, eventTitle: ev.title, amountLabel }),
    })
    if (bellErr) console.error('[tickets] refund notice: bell insert failed', { ticketId, error: bellErr.message })

    try {
      const email = await profileAccountEmail(hostProfileId)
      if (!email) return
      if (!(await resolveSendGate(hostProfileId, 'email', 'transactional', { email })).allowed) return
      const { data: hp } = await admin.from('profiles').select('display_name').eq('id', hostProfileId).maybeSingle()
      const hostName = (hp as { display_name: string | null } | null)?.display_name ?? 'there'
      const body = mail(
        [
          { text: `Hi ${hostName},` },
          { text: `${hostRefundSentence({ buyerName, qty, eventTitle: ev.title, amountLabel })}. The amount comes out of your payout account, and ${qty === 1 ? 'the seat is' : 'the seats are'} back on sale.` },
        ],
        ordersUrl ? { href: ordersUrl, label: 'See it in your orders' } : { href: eventUrl, label: 'See who’s coming' },
      )
      await enqueueEmail(
        { to: email, subject: `Refund sent for ${ev.title}`, ...body },
        { dedupeKey: `ticket-refund-host:${ticket.id}` },
      )
    } catch (err) {
      console.error('[tickets] refund notice: host email failed', { ticketId, err })
    }
  } catch (err) {
    console.error('[tickets] refund notice failed', { ticketId, err })
  }
}
