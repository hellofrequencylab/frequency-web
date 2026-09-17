'use server'

// PRICING A JOURNEY (ADR-1397). The write path behind the sell control: attach a price, change it,
// list it in the Market, or take it off sale.
//
// EVERY action here re-asks `checkJourneySell`. The UI reads `canSell` so the control is hidden or
// upsold rather than offered and then refused, but a hidden button is a courtesy and this is the
// check. Owner ruling 2026-09-17: only a paid Space may sell a Journey.
//
// 🔴 A PRICE IS NEVER EDITED UNDER A LIVE BUYER. Re-pricing archives the old product and writes a
// new one, which is what the `commerce_products_one_live_per_journey` partial unique index is shaped
// for (it exempts archived rows). Orders already placed keep pointing at the row they were bought
// at, so a receipt, a refund and the revenue ledger all still resolve the price that was actually
// charged. Mutating price_cents in place would silently rewrite history, which is the classic
// money-path bug.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { createAdminClient } from '@/lib/supabase/admin'
import { createProduct } from '@/lib/commerce/products'
import { checkJourneySell } from '@/lib/journeys/sell-gate'
import { getJourneyOffer } from '@/lib/journeys/paid'

/** The most a Journey may be priced at, in cents. A guard against a fat finger turning $444 into
 *  $44,400, not a policy about what a program is worth. */
const MAX_PRICE_CENTS = 10_000_00

function db() {
  return createAdminClient() as unknown as {
    from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

/** Archive whatever product currently sells this Journey. Idempotent. */
async function archiveCurrentOffer(planId: string): Promise<void> {
  await db()
    .from('commerce_products')
    .update({ status: 'archived' })
    .eq('journey_plan_id', planId)
    .neq('status', 'archived')
}

/**
 * Put a Journey on sale at `priceCents`, or re-price one already on sale.
 *
 * `listInMarket` is the `market_published` opt-in: false means the Journey sells from its own page
 * and the owning Space's Shop; true also floats it into the main Market. It is deliberately the
 * SAME switch every other product uses, because "where does this sell" is not a new question and a
 * second mechanism for it is how two answers start disagreeing.
 */
export async function setJourneyPriceAction(input: {
  planId: string
  slug: string
  priceCents: number
  listInMarket?: boolean
}): Promise<ActionResult<{ productId: string }>> {
  const callerId = await getMyProfileId()
  const gate = await checkJourneySell(input.planId, callerId)
  if (!gate.ok) return fail(gate.error)

  const cents = Math.round(input.priceCents)
  if (!Number.isFinite(cents) || cents <= 0) return fail('Set a price above zero, or take the Journey off sale.')
  if (cents > MAX_PRICE_CENTS) return fail('That price is higher than this platform sells. Check the amount.')

  const admin = createAdminClient()
  const { data: plan } = await admin
    .from('journey_plans')
    .select('title, summary, cover_image, space_id')
    .eq('id', input.planId)
    .maybeSingle()
  const row = plan as { title: string; summary: string | null; cover_image: string | null; space_id: string | null } | null
  if (!row?.space_id) return fail('This Journey has no Space to sell it.')

  await archiveCurrentOffer(input.planId)

  const product = await createProduct({
    ownerKind: 'space',
    ownerSpaceId: row.space_id,
    productKind: 'journey',
    vertical: 'maker',
    title: row.title,
    description: row.summary ?? null,
    images: row.cover_image ? [row.cover_image] : [],
    priceCents: cents,
    journeyPlanId: input.planId,
    marketPublished: input.listInMarket ?? false,
  })
  if (!product) return fail('Could not put this Journey on sale. Try again.')

  // createProduct writes `draft`; a priced Journey is meant to be buyable.
  const { error } = await db().from('commerce_products').update({ status: 'active' }).eq('id', product.id)
  if (error) {
    // Leave the draft rather than a half-live product, and say so plainly.
    console.error('[journeys] could not activate journey product', { planId: input.planId, error: error.message })
    return fail('The price saved but the Journey is not live yet. Open it in your Shop to publish it.')
  }

  revalidatePath(`/journeys/${input.slug}`)
  return ok({ productId: product.id })
}

/** Take a Journey off sale. Existing enrolments are untouched: people who paid keep what they bought. */
export async function unsetJourneyPriceAction(input: {
  planId: string
  slug: string
}): Promise<ActionResult<void>> {
  const callerId = await getMyProfileId()
  const gate = await checkJourneySell(input.planId, callerId)
  if (!gate.ok) return fail(gate.error)

  const offer = await getJourneyOffer(input.planId)
  if (!offer) return ok()

  await archiveCurrentOffer(input.planId)
  revalidatePath(`/journeys/${input.slug}`)
  return ok()
}
