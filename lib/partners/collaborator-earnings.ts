import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { partialRefundedCents } from '@/lib/commerce/orders'

// WHAT A COLLABORATOR'S PAID JOURNEYS SETTLED (LIVE-708). The Earnings view on
// /partners/collaborators/earnings reads this: for every Journey the member authored and sells, the
// money the sale lines actually settled, net of the platform fee and of every refund. No affiliate
// kickback or commission is computed or implied (LIVE-607, "No affiliate money"): this is the
// author's own sales and nothing else.
//
// THE MONEY RULES are the Orders tab's (lib/commerce/orders.ts spaceEarningsSummary), applied per
// LINE because one order can carry a Journey beside other things (a split cart, a mug, shipping):
//   · only settled orders count ('paid' / 'fulfilled'); a 'refunded' order counts its line as
//     refunded; pending, failed and cancelled count nothing;
//   · a PARTIAL refund on a still-settled order (LIVE-160) takes the same share off the line as it
//     took off the order, and the fee comes back pro-rata, the way Stripe reverses it;
//   · the order's platform fee is shared across its lines by subtotal.

/** The untyped handle: `commerce_products.journey_plan_id` is not in the generated types until
 *  lib/database.types.ts regenerates (ADR-246). Scoped to this module. */
function db() {
  return createAdminClient() as unknown as {
    from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

/** One sold line of one of the author's Journeys, with the order it rode on. */
export interface JourneySaleLine {
  planId: string
  subtotalCents: number
  /** Every line subtotal on the same order, this one included (the fee's denominator). */
  orderItemsCents: number
  order: {
    status: string
    amountCents: number
    platformFeeCents: number
    metadata: unknown
  }
}

export interface JourneyEarningsRow {
  planId: string
  title: string
  slug: string | null
  grossCents: number
  feeCents: number
  netCents: number
  refundedCents: number
  sales: number
}

export interface CollaboratorEarnings {
  grossCents: number
  feeCents: number
  netCents: number
  refundedCents: number
  sales: number
  currency: string
  journeys: JourneyEarningsRow[]
}

const EMPTY_TOTALS = { grossCents: 0, feeCents: 0, netCents: 0, refundedCents: 0, sales: 0 }

/** Fold sale lines into per-Journey and total figures. PURE. */
export function foldJourneyEarnings(
  lines: readonly JourneySaleLine[],
  plans: ReadonlyMap<string, { title: string; slug: string | null }>,
): Omit<CollaboratorEarnings, 'currency'> {
  const byPlan = new Map<string, JourneyEarningsRow>()
  const total = { ...EMPTY_TOTALS }
  for (const l of lines) {
    const sub = Math.max(0, Math.round(l.subtotalCents) || 0)
    if (sub === 0) continue
    const row =
      byPlan.get(l.planId) ??
      ({ planId: l.planId, title: plans.get(l.planId)?.title ?? 'Journey', slug: plans.get(l.planId)?.slug ?? null, ...EMPTY_TOTALS } as JourneyEarningsRow)
    const status = l.order.status
    if (status === 'refunded') {
      row.refundedCents += sub
      row.sales += 1
    } else if (status === 'paid' || status === 'fulfilled') {
      const amount = Math.max(0, l.order.amountCents)
      const share = l.orderItemsCents > 0 ? sub / l.orderItemsCents : 1
      const refundedShare = amount > 0 ? partialRefundedCents(l.order.metadata, amount) / amount : 0
      const lineFee = Math.round(Math.max(0, l.order.platformFeeCents) * share)
      const refunded = Math.round(sub * refundedShare)
      const feeBack = Math.round(lineFee * refundedShare)
      row.grossCents += sub - refunded
      row.feeCents += lineFee - feeBack
      row.refundedCents += refunded
      row.sales += 1
    } else {
      continue
    }
    byPlan.set(l.planId, row)
  }
  const journeys = [...byPlan.values()]
    .map((r) => ({ ...r, netCents: r.grossCents - r.feeCents }))
    .sort((a, b) => b.netCents - a.netCents || a.title.localeCompare(b.title))
  for (const r of journeys) {
    total.grossCents += r.grossCents
    total.feeCents += r.feeCents
    total.refundedCents += r.refundedCents
    total.sales += r.sales
  }
  total.netCents = total.grossCents - total.feeCents
  return { ...total, journeys }
}

/** The author's Journey earnings. FAIL-SAFE to zeros, logged, so the view never breaks. */
export async function getCollaboratorEarnings(profileId: string): Promise<CollaboratorEarnings> {
  const empty: CollaboratorEarnings = { ...EMPTY_TOTALS, currency: 'usd', journeys: [] }
  try {
    const client = db()
    const { data: plans, error: planErr } = await client
      .from('journey_plans')
      .select('id, title, slug')
      .eq('author_id', profileId)
    if (planErr) throw planErr
    const planMap = new Map<string, { title: string; slug: string | null }>(
      ((plans ?? []) as { id: string; title: string | null; slug: string | null }[]).map((p) => [
        p.id,
        { title: p.title ?? 'Journey', slug: p.slug },
      ]),
    )
    if (planMap.size === 0) return empty

    const { data: products, error: prodErr } = await client
      .from('commerce_products')
      .select('id, journey_plan_id')
      .in('journey_plan_id', [...planMap.keys()])
    if (prodErr) throw prodErr
    const planByProduct = new Map<string, string>(
      ((products ?? []) as { id: string; journey_plan_id: string }[]).map((p) => [p.id, p.journey_plan_id]),
    )
    if (planByProduct.size === 0) return { ...empty, journeys: [] }

    const { data: items, error: itemErr } = await client
      .from('commerce_order_items')
      .select('order_id, product_id, subtotal_cents')
      .in('product_id', [...planByProduct.keys()])
    if (itemErr) throw itemErr
    const sold = (items ?? []) as { order_id: string; product_id: string; subtotal_cents: number }[]
    if (sold.length === 0) return empty
    const orderIds = [...new Set(sold.map((i) => i.order_id))]

    const [{ data: orders, error: orderErr }, { data: allItems, error: allErr }] = await Promise.all([
      client
        .from('commerce_orders')
        .select('id, status, amount_cents, platform_fee_cents, metadata, currency')
        .in('id', orderIds),
      client.from('commerce_order_items').select('order_id, subtotal_cents').in('order_id', orderIds),
    ])
    if (orderErr) throw orderErr
    if (allErr) throw allErr
    const orderById = new Map(
      ((orders ?? []) as {
        id: string
        status: string
        amount_cents: number | null
        platform_fee_cents: number | null
        metadata: unknown
        currency: string | null
      }[]).map((o) => [o.id, o]),
    )
    const itemsTotal = new Map<string, number>()
    for (const i of (allItems ?? []) as { order_id: string; subtotal_cents: number }[]) {
      itemsTotal.set(i.order_id, (itemsTotal.get(i.order_id) ?? 0) + (Number(i.subtotal_cents) || 0))
    }

    const lines: JourneySaleLine[] = []
    let currency = 'usd'
    for (const i of sold) {
      const o = orderById.get(i.order_id)
      const planId = planByProduct.get(i.product_id)
      if (!o || !planId) continue
      if (o.currency) currency = o.currency
      lines.push({
        planId,
        subtotalCents: Number(i.subtotal_cents) || 0,
        orderItemsCents: itemsTotal.get(i.order_id) ?? 0,
        order: {
          status: o.status,
          amountCents: Number(o.amount_cents) || 0,
          platformFeeCents: Number(o.platform_fee_cents) || 0,
          metadata: o.metadata,
        },
      })
    }
    return { ...foldJourneyEarnings(lines, planMap), currency }
  } catch (error) {
    console.error('[collaborator earnings] read failed', { profileId, error })
    return empty
  }
}
