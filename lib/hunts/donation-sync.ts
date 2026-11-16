/**
 * The live half of the Trail donation ask (FH-046S): the IO over lib/hunts/donation-ask.ts.
 *
 * A Trail never takes a gift. The gift is an ordinary Space donation to the beneficiary's fund, taken by
 * lib/billing/space-donation-checkout.ts with its own receipt. This file does three things only:
 *   - GATE. `openDonationAsk` answers through `decideDonationAsk`. With HUNTS_COMMERCE_ENABLED off it reads
 *     nothing. With the switch on, an ask with no recorded approver (the D8 sign-off, FH-045) stays shut,
 *     so no ask renders and no gift can be tagged to a Trail.
 *   - MIRROR. Each provider event re-reads the canonical donation and copies its status into
 *     `hunt_donation_gifts` through `giftStatusFromDonation`. A refunded amount only ever grows, so a
 *     replayed or late event cannot shrink a refund.
 *   - REPORT. `huntGiftTotals` prices every gift from the canonical donation's status as it is now, so a
 *     mirror write that was missed can not overstate what was raised.
 *
 * It writes `hunt_donation_gifts` and nothing else. It never reads or writes a run, a claim or progress,
 * and lib/hunts/donation-sync.test.ts keeps it that way. A failure here never fails settlement: the donor
 * has paid and the Space donation is recorded, so the hooks log loudly and return.
 */
import type Stripe from 'stripe'
import { spaceCanTakeDonations } from '@/lib/billing/space-donation-checkout'
import { getDonationAsk } from '@/lib/spaces/donations'
import { db } from './commerce-store'
import { decideDonationAsk, giftStatusFromDonation, settledDonationTotals, type DonationAsk, type Gift } from './donation-ask'
import { huntSwitchOn } from './flags'

type AskRow = {
  id: string
  hunt_id: string
  beneficiary_space_id: string
  enabled: boolean
  approved_at: string | null
  approved_by: string | null
  headline: string | null
}

type HuntStatus = Parameters<typeof decideDonationAsk>[0]['huntStatus']

type OpenAsk = Readonly<{
  askId: string
  beneficiarySpaceId: string
  beneficiaryName: string
  purpose: string
  suggestedAmountsCents: number[]
}>

/**
 * The Trail's donation ask when every gate is open, else null. Fails closed: a read that errors hides the
 * ask. The cheap gates (switch, approval, Trail status) run before the payee is asked anything.
 */
export async function openDonationAsk(huntId: string): Promise<OpenAsk | null> {
  if (!huntId || !huntSwitchOn('commerce')) return null
  try {
    const { data: askData, error: askError } = await db()
      .from('hunt_donation_asks')
      .select('id, hunt_id, beneficiary_space_id, enabled, approved_at, approved_by, headline')
      .eq('hunt_id', huntId)
      .maybeSingle()
    const row = askError ? null : (askData as AskRow | null)
    if (!row) return null
    const { data: huntData } = await db().from('hunts').select('status').eq('id', huntId).maybeSingle()
    const huntStatus = ((huntData as { status?: string } | null)?.status ?? 'draft') as HuntStatus
    const ask: DonationAsk = {
      huntId: row.hunt_id,
      beneficiarySpaceId: row.beneficiary_space_id,
      enabled: row.enabled,
      approvedAt: row.approved_at,
      approvedBy: row.approved_by,
    }
    const gates = { commerceSwitchOn: huntSwitchOn('commerce'), ask, huntStatus }
    if (!decideDonationAsk({ ...gates, beneficiaryPayeeReady: true }).show) return null

    // The payee is ready only when the beneficiary Space has a published fund AND can receive money.
    const [fund, canGive, spaceRes] = await Promise.all([
      getDonationAsk(row.beneficiary_space_id),
      spaceCanTakeDonations(row.beneficiary_space_id),
      db().from('spaces').select('name, brand_name').eq('id', row.beneficiary_space_id).maybeSingle(),
    ])
    if (!decideDonationAsk({ ...gates, beneficiaryPayeeReady: canGive && !!fund }).show || !fund) return null
    const space = spaceRes.data as { name?: string | null; brand_name?: string | null } | null
    return {
      askId: row.id,
      beneficiarySpaceId: row.beneficiary_space_id,
      beneficiaryName: (space?.brand_name ?? space?.name ?? '').trim() || fund.fundLabel,
      purpose: (row.headline ?? '').trim() || (fund.description ?? '').trim() || fund.fundLabel,
      suggestedAmountsCents: fund.suggestedAmountsCents,
    }
  } catch (err) {
    console.error('[hunt-gift] ask read failed; the ask stays hidden', err instanceof Error ? err.message : String(err))
    return null
  }
}

/** The ask id a gift to `spaceId` may be tagged with, or null. A Trail id from the browser is only a claim. */
export async function huntGiftAskId(huntId: string, spaceId: string): Promise<string | null> {
  const ask = await openDonationAsk(huntId)
  return ask && ask.beneficiarySpaceId === spaceId ? ask.askId : null
}

type DonationRow = {
  id: string
  space_id: string
  amount_cents: number
  currency: string | null
  status: 'pending' | 'succeeded' | 'refunded' | 'abandoned'
  succeeded_at: string | null
}
const DONATION_COLS = 'id, space_id, amount_cents, currency, status, succeeded_at'

type GiftRow = { id: string; refunded_minor: number; status: Gift['status']; settled_at: string | null }

type MirrorResult = 'created' | 'updated' | 'unchanged' | 'not_a_hunt_gift'

/**
 * Copy one canonical donation into the Trail's mirror. `askId` is needed only to CREATE the row; a refund
 * finds the gift by its donation. `refundedMinor` is the provider's cumulative refunded amount.
 */
async function mirrorDonation(donation: DonationRow, askId: string | null, refundedMinor: number): Promise<MirrorResult> {
  const { data: existingData, error: readError } = await db()
    .from('hunt_donation_gifts')
    .select('id, refunded_minor, status, settled_at')
    .eq('donation_id', donation.id)
    .maybeSingle()
  if (readError) throw new Error(`hunt_donation_gifts read failed: ${readError.message}`)
  const existing = existingData as GiftRow | null
  if (!existing && !askId) return 'not_a_hunt_gift'

  const mapped = giftStatusFromDonation({
    status: donation.status,
    amountMinor: donation.amount_cents,
    refundedMinor: Math.max(existing?.refunded_minor ?? 0, refundedMinor),
  })
  const paid = mapped.status === 'settled' || mapped.status === 'refunded'
  const settledAt = existing?.settled_at ?? (paid ? donation.succeeded_at ?? new Date().toISOString() : null)
  const state = { status: mapped.status, refunded_minor: mapped.refundedMinor, settled_at: settledAt }

  if (existing) {
    if (existing.status === state.status && existing.refunded_minor === state.refunded_minor) return 'unchanged'
    const { error } = await db().from('hunt_donation_gifts').update(state).eq('id', existing.id)
    if (error) throw new Error(`hunt_donation_gifts update failed: ${error.message}`)
    return 'updated'
  }

  // A new gift must answer an ask whose beneficiary is the Space that was actually paid.
  const { data: askData } = await db().from('hunt_donation_asks').select('id, beneficiary_space_id').eq('id', askId).maybeSingle()
  const ask = askData as { id: string; beneficiary_space_id: string } | null
  if (!ask || ask.beneficiary_space_id !== donation.space_id) throw new Error('the gift names an ask for a different beneficiary')
  // unique (donation_id): a concurrent delivery lands on the same row instead of a second one.
  const { error } = await db()
    .from('hunt_donation_gifts')
    .upsert(
      { ask_id: ask.id, donation_id: donation.id, currency: (donation.currency ?? 'usd').toUpperCase(), amount_minor: donation.amount_cents, ...state },
      { onConflict: 'donation_id' },
    )
  if (error) throw new Error(`hunt_donation_gifts write failed: ${error.message}`)
  return 'created'
}

async function donationBy(column: 'stripe_checkout_session_id' | 'stripe_payment_intent_id', value: string): Promise<DonationRow | null> {
  const { data, error } = await db().from('space_donations').select(DONATION_COLS).eq(column, value).maybeSingle()
  if (error) throw new Error(`space_donations read failed: ${error.message}`)
  return (data as DonationRow | null) ?? null
}

/** Run one mirror step so it can never throw into checkout or settlement. A miss is logged, never silent. */
async function safely(label: string, fn: () => Promise<MirrorResult | null>): Promise<MirrorResult | 'failed' | null> {
  if (!huntSwitchOn('commerce')) return null
  try {
    return await fn()
  } catch (err) {
    console.error(`[hunt-gift] ${label} failed; totals fall back to the canonical donation`, err instanceof Error ? err.message : String(err))
    return 'failed'
  }
}

/** Mirror the donation behind a Checkout session as it stands now (started, settled or abandoned). */
export function mirrorGiftForSession(sessionId: string, askId: string): Promise<MirrorResult | 'failed' | null> {
  return safely('session mirror', async () => {
    const donation = await donationBy('stripe_checkout_session_id', sessionId)
    return donation ? mirrorDonation(donation, askId, 0) : null
  })
}

/** Webhook: a donation session completed, paid late, expired or failed. Only a session tagged with a Trail ask is ours. */
export async function huntsAfterDonationSession(session: Pick<Stripe.Checkout.Session, 'id' | 'metadata'>): Promise<MirrorResult | 'failed' | null> {
  const askId = session.metadata?.kind === 'space_donation' ? session.metadata.hunt_ask_id : undefined
  if (!askId) return null
  return mirrorGiftForSession(session.id, askId)
}

/** Webhook: a refunded charge. A full refund reads `refunded`; a partial one stays settled with its amount. */
export function huntsAfterDonationRefund(charge: Pick<Stripe.Charge, 'payment_intent' | 'amount_refunded'>): Promise<MirrorResult | 'failed' | null> {
  return safely('refund mirror', async () => {
    const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
    if (!pi) return null
    const donation = await donationBy('stripe_payment_intent_id', pi)
    return donation ? mirrorDonation(donation, null, Math.max(0, charge.amount_refunded ?? 0)) : null
  })
}

/**
 * Settled totals for one ask, by currency. Each gift is priced from the canonical donation's status as it
 * is NOW plus the mirrored refunded amount, so only money received and kept is ever called raised.
 */
export async function huntGiftTotals(askId: string): Promise<ReturnType<typeof settledDonationTotals>> {
  if (!huntSwitchOn('commerce')) return []
  const { data: giftData, error } = await db()
    .from('hunt_donation_gifts')
    .select('donation_id, currency, amount_minor, refunded_minor, status')
    .eq('ask_id', askId)
  if (error) throw new Error(`hunt_donation_gifts read failed: ${error.message}`)
  const gifts = (giftData as { donation_id: string; currency: string; amount_minor: number; refunded_minor: number; status: Gift['status'] }[] | null) ?? []
  if (gifts.length === 0) return []
  const { data: donationData } = await db().from('space_donations').select('id, status').in('id', gifts.map((g) => g.donation_id))
  const canonical = new Map(((donationData as Pick<DonationRow, 'id' | 'status'>[] | null) ?? []).map((d) => [d.id, d.status]))
  return settledDonationTotals(
    gifts.map((g) => {
      const status = canonical.get(g.donation_id)
      const now = status ? giftStatusFromDonation({ status, amountMinor: g.amount_minor, refundedMinor: g.refunded_minor }) : { status: g.status, refundedMinor: g.refunded_minor }
      return { currency: g.currency, amountMinor: g.amount_minor, refundedMinor: now.refundedMinor, status: now.status }
    }),
  )
}
