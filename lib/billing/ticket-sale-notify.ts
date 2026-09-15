// Tickets: the HOST's side (LIVE-345). Until this module there was no ticket-sold notification of
// any kind anywhere in the product. The buyer got a receipt (lib/events/guest-ticket-email.ts,
// lib/events/member-ticket-email.ts), the ledger got a row, `sold` moved, and the person whose
// event it was and whose money it is was told nothing at all. Their Stripe payout was the only
// signal, days later, with no event name on it.
//
// This is the exact shape of lib/billing/tips-notify.ts one channel over: a bell AND an email, from
// the same recorder, on the transactional gate, never throwing. Read that file beside this one.
//
// Two differences from the tip notice, both because a ticket is inventory rather than a gift:
//   * THE FEE IS NAMED. A tip is 0% and says so. A ticket carries a take rate, so the notice states
//     the gross, the fee that was actually charged (off the ticket row, never recomputed) and that
//     the rest is on its way to the payout account. A host who learns the rate from their bank
//     statement learns it in the worst possible place.
//   * THE OVERAGE RIDES ALONG. settle_ticket_atomic re-measures tier capacity under the per-tier
//     advisory lock before it flips (LIVE-343, migration 20270345004700) and HONOURS a ticket that
//     no longer fits rather than silently dropping a purchase the buyer was charged for. The host is
//     the only party who can act on that -- add a chair, move the room, refund on purpose -- so the
//     numbers it measured are printed here. This notice is the channel that decision depends on.
//
// Server-only: it opens the service-role client.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { profileAccountEmail } from '@/lib/profiles/account-email'
import { formatPriceCents } from '@/lib/commerce/types'

/** What the settle path hands over: the row settle_ticket_atomic flipped, plus the gross off the
 *  Checkout Session Stripe signed. Everything needed to compose the notice rides on it, so a
 *  redelivered webhook cannot notify twice: the flip returns zero rows the second time and this is
 *  never called. */
export interface SoldTicket {
  id: string
  event_id: string
  ticket_type_id: string | null
  qty: number
  /** Gross paid, minor units, off the signed session. Null prints no amount. */
  amount_cents: number | null
  /** The fee actually charged, off the ticket row. Never recomputed (ADR-914). */
  platform_fee_cents: number
  currency: string
  /** The buyer, or null when a signed-out guest bought it. */
  buyer_profile_id: string | null
  /** The guest's address, when there is no buyer profile. DELIBERATELY UNUSED by the message today,
   *  and carried anyway because the caller holds it and a notice that quietly re-derived it later
   *  would be the worse shape. Whether a buyer has a name is decided by `buyer_profile_id`, which is
   *  the column the settled row actually carries; the host reads addresses on the attendee list,
   *  which checks who is asking, and never in a bell body that gets forwarded. */
  guest_email: string | null
  /** settle_ticket_atomic's verdict: honouring this ticket put the tier past `quantity`. */
  over_capacity: boolean
  /** The numbers behind that verdict. Null on an uncapped tier or a flat-price ticket. */
  tier_quantity: number | null
  tier_committed: number | null
}

/** A signed-out buyer has no display name. The host sees the address on the attendee list; a bell
 *  is not the place to print somebody's email. */
export const ANONYMOUS_BUYER = 'A guest'

export const TICKET_SALE_NOTIFICATION_TYPE = 'ticket_sold'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** "a ticket" / "2 tickets". Plain, and it carries the number, which is the thing the host wants. */
export function ticketCountLabel(qty: number): string {
  const n = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1
  return n === 1 ? 'a ticket' : `${n} tickets`
}

/** The one sentence that says the tier is past its limit, or null when it is not.
 *  Pure, so the wording is testable without a database. */
export function overageLine(sale: Pick<SoldTicket, 'over_capacity' | 'tier_quantity' | 'tier_committed' | 'qty'>): string | null {
  if (!sale.over_capacity) return null
  const quantity = sale.tier_quantity
  if (typeof quantity !== 'number') {
    return 'This ticket puts the tier past its limit. Check the attendee list before the doors open.'
  }
  const sold = (sale.tier_committed ?? 0) + (Number.isFinite(sale.qty) && sale.qty > 0 ? Math.floor(sale.qty) : 1)
  return `This tier is now past its limit: ${sold} sold against ${quantity}. You can refund a ticket or make room for one more.`
}

/** Tell the host they sold a ticket: a bell and an email.
 *
 *  Never throws. The money has already moved and the ticket is already `succeeded` by the time this
 *  runs, so a throw here would only turn a finished sale into a 500 that Stripe redelivers to no
 *  effect. Every failure is logged, because a fail-safe nobody can see fired is an invisible
 *  regression (AGENTS.md). */
export async function notifyTicketSaleHost(sale: SoldTicket): Promise<void> {
  const admin = createAdminClient()

  // ── WHO GETS PAID IS WHO GETS TOLD ──────────────────────────────────────────────────────────
  // The same resolution createTicketCheckout uses to pick the payee (ADR-819, and NAMING.md
  // "money follows the Host"): a Space-hosted event pays the hosting Space through its owner's
  // payout account; a personal event pays the host. Cohosts run the event and are not the payee,
  // so they are deliberately not on this notice.
  const { data: eventData, error: eventErr } = await admin
    .from('events')
    .select('title, slug, host_id, host_space_id')
    .eq('id', sale.event_id)
    .maybeSingle()
  if (eventErr) {
    console.error('[tickets] sale notice: event read failed', { ticketId: sale.id, error: eventErr.message })
    return
  }
  const ev = eventData as { title: string; slug: string; host_id: string | null; host_space_id: string | null } | null
  if (!ev) {
    console.error('[tickets] sale notice: event not found; the HOST was NOT told about a sale', {
      ticketId: sale.id,
      eventId: sale.event_id,
    })
    return
  }

  let hostProfileId: string | null = ev.host_id
  if (ev.host_space_id) {
    const { data: space, error: spaceErr } = await admin
      .from('spaces')
      .select('owner_profile_id')
      .eq('id', ev.host_space_id)
      .maybeSingle()
    if (spaceErr) {
      console.error('[tickets] sale notice: host space read failed', { ticketId: sale.id, error: spaceErr.message })
      return
    }
    hostProfileId = (space as { owner_profile_id: string | null } | null)?.owner_profile_id ?? null
  }
  if (!hostProfileId) {
    console.error('[tickets] sale notice: the event has no host to tell; a sale went unannounced', {
      ticketId: sale.id,
      eventId: sale.event_id,
    })
    return
  }

  // The buyer's name, or "A guest". A guest reaches no profile read at all: `.eq('id', null)`
  // matches nothing and issuing it would let a later reader believe the name was looked for.
  let buyerName: string = ANONYMOUS_BUYER
  if (sale.buyer_profile_id) {
    const { data: buyer, error } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', sale.buyer_profile_id)
      .maybeSingle()
    if (error) console.error('[tickets] sale notice: buyer lookup failed', { ticketId: sale.id, error: error.message })
    if ((buyer as { display_name: string | null } | null)?.display_name) {
      buyerName = (buyer as { display_name: string }).display_name
    }
  }

  // The tier's name, best-effort: a missing name costs a label, never the notice.
  let tierName: string | null = null
  if (sale.ticket_type_id) {
    const { data: tier } = await admin
      .from('event_ticket_types')
      .select('name')
      .eq('id', sale.ticket_type_id)
      .maybeSingle()
    tierName = (tier as { name: string | null } | null)?.name ?? null
  }

  const countLabel = ticketCountLabel(sale.qty)
  const overage = overageLine(sale)

  // 1. The bell. The bell renders the actor's name in front of `body`, so with a member buyer the
  //    row reads "<name> bought 2 tickets to <event>"; a guest has no actor and the body carries
  //    the whole sentence. reference_type 'event' lands on the events index, which is what an id
  //    can address for a slug-routed page (lib/notifications/href.ts).
  const { error: bellErr } = await admin.from('notifications').insert({
    recipient_id: hostProfileId,
    actor_id: sale.buyer_profile_id,
    type: TICKET_SALE_NOTIFICATION_TYPE,
    reference_type: 'event',
    reference_id: sale.event_id,
    body: sale.buyer_profile_id
      ? `bought ${countLabel} to ${ev.title}`
      : `${ANONYMOUS_BUYER} bought ${countLabel} to ${ev.title}`,
  })
  if (bellErr) {
    console.error('[tickets] sale notice: bell insert failed', { ticketId: sale.id, error: bellErr.message })
  }

  // 2. Email, through the durable outbox. Money that landed in your account is transactional mail,
  //    the same call tips-notify makes: only the suppression list can stop it, and the address is
  //    resolved first so the gate can see it.
  try {
    const email = await profileAccountEmail(hostProfileId)
    if (!email) {
      console.error('[tickets] sale notice: the host has no account email; only the bell was sent', {
        ticketId: sale.id,
        hostProfileId,
      })
      return
    }
    if (!(await resolveSendGate(hostProfileId, 'email', 'transactional', { email })).allowed) return

    const { data: hostProfile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', hostProfileId)
      .maybeSingle()
    const hostName = (hostProfile as { display_name: string | null } | null)?.display_name ?? 'there'

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    const copy = {
      hostName,
      buyerName,
      countLabel,
      eventTitle: ev.title,
      tierName,
      grossLabel:
        typeof sale.amount_cents === 'number' && sale.amount_cents > 0
          ? formatPriceCents(sale.amount_cents, sale.currency)
          : null,
      feeLabel: formatPriceCents(Math.max(0, sale.platform_fee_cents ?? 0), sale.currency),
      feeIsZero: (sale.platform_fee_cents ?? 0) <= 0,
      overage,
      eventUrl: `${appUrl}/events/${ev.slug}`,
    }

    await enqueueEmail({
      to: email,
      subject: `You sold ${countLabel} to ${ev.title}`,
      html: saleEmailHtml(copy),
      text: saleEmailText(copy),
    })
  } catch (err) {
    console.error('[tickets] sale notice: host email failed', { ticketId: sale.id, err })
  }
}

// ── The message ────────────────────────────────────────────────────────────────────────────────

interface SaleCopy {
  hostName: string
  buyerName: string
  countLabel: string
  eventTitle: string
  tierName: string | null
  grossLabel: string | null
  feeLabel: string
  feeIsZero: boolean
  overage: string | null
  eventUrl: string
}

/** The sale in one sentence, shared by both renderings so they can never drift. */
export function saleSentence(c: Pick<SaleCopy, 'buyerName' | 'countLabel' | 'eventTitle' | 'tierName' | 'grossLabel'>): string {
  const tier = c.tierName ? ` (${c.tierName})` : ''
  const amount = c.grossLabel ? ` for ${c.grossLabel}` : ''
  return `${c.buyerName} bought ${c.countLabel} to ${c.eventTitle}${tier}${amount}.`
}

/** What happens to the money, in the plain words NAMING.md §"Money in" locks: payout account, never
 *  Stripe Connect, in anything a member or operator reads. */
export function payoutSentence(c: Pick<SaleCopy, 'feeLabel' | 'feeIsZero'>): string {
  return c.feeIsZero
    ? 'Frequency took nothing on this sale. The full amount goes to your payout account on your usual payout schedule.'
    : `Frequency's fee on this sale was ${c.feeLabel}. The rest goes to your payout account on your usual payout schedule.`
}

// Email HTML, not UI chrome: mail clients read no design tokens, so the palette is the same literal
// ink / muted / rule values lib/email.ts uses for every other transactional email.
const EMAIL_INK = '#3D352A' // token-ok: email HTML, mirrors lib/email.ts
const EMAIL_MUTED = '#6B6253' // token-ok: email HTML, mirrors lib/email.ts
const EMAIL_RULE = '#E9E1D4' // token-ok: email HTML, mirrors lib/email.ts
const EMAIL_P = `font-size:15px;line-height:1.6;margin:0 0 20px;`

function saleEmailHtml(c: SaleCopy): string {
  const overageBlock = c.overage
    ? `<p style="${EMAIL_P}color:${EMAIL_INK};border-left:3px solid ${EMAIL_RULE};padding-left:12px;">${escapeHtml(c.overage)}</p>`
    : ''
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;">
<p style="${EMAIL_P}color:${EMAIL_INK};">Hi ${escapeHtml(c.hostName)},</p>
<p style="${EMAIL_P}color:${EMAIL_INK};">${escapeHtml(saleSentence(c))}</p>
${overageBlock}
<p style="${EMAIL_P}color:${EMAIL_MUTED};">${escapeHtml(payoutSentence(c))}</p>
<p style="${EMAIL_P}color:${EMAIL_INK};"><a href="${c.eventUrl}" style="color:${EMAIL_INK};">See who’s coming</a></p>
</div>`
}

function saleEmailText(c: SaleCopy): string {
  const lines = [`Hi ${c.hostName},`, '', saleSentence(c)]
  if (c.overage) lines.push('', c.overage)
  lines.push('', payoutSentence(c), '', `See who’s coming: ${c.eventUrl}`)
  return lines.join('\n')
}
