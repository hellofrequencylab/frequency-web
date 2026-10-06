// Partner offers: the pure half of the write side (scan2 L9-04, 2026-09-05). `partner_offers` had a
// reader (lib/partners/read.ts) and no writer anywhere, so the "Member offers" section on
// /partners/[slug] was always empty. The listing form's Offers section writes through the server
// action in app/(main)/partners/listing/actions.ts; the validation and the row shape live here so
// they can be tested without a client, and so the capture path (lib/engagement/capture.ts) and the
// read layer agree on what "live" means.
//
// Columns are the ones lib/database.types.ts declares for partner_offers: title, description,
// member_terms, valid_until, active, quest_id (LIVE-673: a Quest sponsor reward) and visits_required
// (LIVE-710: a loyalty card).

import type { Database } from '@/lib/database.types'

type PartnerOfferInsert = Database['public']['Tables']['partner_offers']['Insert']

export interface OfferInput {
  /** Present on an edit; absent on a new offer. */
  id?: string | null
  title: string
  description: string
  /** What the member has to do or show; stored as `member_terms`. */
  terms: string
  /** `YYYY-MM-DD` (a date input) or empty for no expiry. */
  validUntil: string
  active: boolean
  /** LIVE-673: the Quest this offer rewards (a sponsor reward), or empty for an ordinary offer.
   *  The action checks the Quest exists; this only shapes it. */
  questId?: string | null
  /** LIVE-710: visits that earn this offer (a loyalty card), or empty for an ordinary offer. */
  visitsRequired?: string | number | null
}

const LOYALTY_VISITS = { min: 2, max: 50 } as const

export const OFFER_TITLE_MAX = 120
const OFFER_TEXT_MAX = 1000

type OfferRowResult =
  | { ok: true; row: Omit<PartnerOfferInsert, 'partner_id'> }
  | { ok: false; error: string }

/** End of the given calendar day in UTC, so an offer "valid until 12 June" still shows on 12 June. */
function endOfDayIso(ymd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999)
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  // Reject a rolled-over date such as 2026-02-31.
  if (d.getUTCMonth() !== Number(m[2]) - 1) return null
  return d.toISOString()
}

/** Validate and normalise the form's input into the columns partner_offers takes. */
export function buildOfferRow(input: OfferInput): OfferRowResult {
  const title = (input.title ?? '').trim()
  if (!title) return { ok: false, error: 'An offer needs a title.' }
  if (title.length > OFFER_TITLE_MAX) return { ok: false, error: `Keep the title under ${OFFER_TITLE_MAX} characters.` }

  const description = (input.description ?? '').trim()
  const terms = (input.terms ?? '').trim()
  if (description.length > OFFER_TEXT_MAX || terms.length > OFFER_TEXT_MAX) {
    return { ok: false, error: `Keep each text field under ${OFFER_TEXT_MAX} characters.` }
  }

  let valid_until: string | null = null
  const rawDate = (input.validUntil ?? '').trim()
  if (rawDate) {
    valid_until = endOfDayIso(rawDate)
    if (!valid_until) return { ok: false, error: 'Use a real date for valid until (YYYY-MM-DD).' }
  }

  let visits_required: number | null | undefined
  if (input.visitsRequired !== undefined) {
    const raw = String(input.visitsRequired ?? '').trim()
    if (!raw) visits_required = null
    else {
      const n = Number(raw)
      if (!Number.isInteger(n) || n < LOYALTY_VISITS.min || n > LOYALTY_VISITS.max) {
        return { ok: false, error: `A loyalty card takes ${LOYALTY_VISITS.min} to ${LOYALTY_VISITS.max} visits.` }
      }
      visits_required = n
    }
  }
  if (visits_required && (input.questId ?? '').trim()) {
    return { ok: false, error: 'An offer is a Quest reward or a loyalty card, not both.' }
  }

  return {
    ok: true,
    row: {
      title,
      description: description || null,
      member_terms: terms || null,
      valid_until,
      active: Boolean(input.active),
      // Only when the form sent one, so a caller that predates the field never clears a link.
      ...(input.questId !== undefined ? { quest_id: (input.questId ?? '').trim() || null } : {}),
      ...(visits_required !== undefined ? { visits_required } : {}),
    },
  }
}

/** Live = switched on and not past its valid_until. Shared by the read layer and the capture path. */
export function isOfferLive(
  offer: { active: boolean; valid_until: string | null },
  nowIso: string = new Date().toISOString(),
): boolean {
  return offer.active === true && (!offer.valid_until || offer.valid_until >= nowIso)
}

/**
 * Which offer a plaque tap redeems (LIVE-673). A Quest sponsor reward is a one-off a member earns
 * by finishing that Quest (`earnedQuestIds`): an earned one not yet claimed (`redeemedOfferIds`)
 * is what the tap claims, because it is the reward the member walked in for. Otherwise the tap is
 * credited to an ordinary offer only when exactly ONE is live: with several, the plaque does not
 * say which one the member came for (scan2 L9-04), so it stays null rather than guessing. A Quest
 * reward never goes to a member who has not earned it, or a second time. PURE.
 */
export function pickPlaqueOffer<T extends { id: string; quest_id?: string | null; visits_required?: number | null }>(
  live: readonly T[],
  earnedQuestIds: ReadonlySet<string>,
  redeemedOfferIds: ReadonlySet<string> = new Set(),
): T | null {
  const questRewards = live.filter((o) => !!o.quest_id && earnedQuestIds.has(o.quest_id) && !redeemedOfferIds.has(o.id))
  if (questRewards.length === 1) return questRewards[0]
  if (questRewards.length > 1) return null
  // A loyalty card (LIVE-710) is earned by visits and claimed at the counter, never by a tap.
  const plain = live.filter((o) => !o.quest_id && !o.visits_required)
  return plain.length === 1 ? plain[0] : null
}

export interface LoyaltyProgress {
  /** Visits since the member last claimed this card. */
  visits: number
  required: number
  earned: boolean
}

/**
 * Where a member stands on a loyalty card (LIVE-710). A visit is a plaque tap at the partner (a
 * partner_redemptions row that is not itself a loyalty claim); a claim resets the count, so only
 * visits after the latest claim of THIS card count. PURE.
 */
export function loyaltyProgress(
  rows: readonly { offer_id: string | null; source: string | null; redeemed_at: string }[],
  offerId: string,
  required: number,
): LoyaltyProgress {
  let lastClaim = ''
  for (const r of rows) if (r.source === 'loyalty' && r.offer_id === offerId && r.redeemed_at > lastClaim) lastClaim = r.redeemed_at
  const visits = rows.filter((r) => r.source !== 'loyalty' && r.redeemed_at > lastClaim).length
  return { visits: Math.min(visits, required), required, earned: visits >= required }
}
