import 'server-only'

// RECORD A PAID FOUNDING YEAR ON THE SPACE'S FOUNDER ROW (LIVE-2541).
//
// The Founding Year checkout (space-plan-checkout.ts) charges the whole year today and holds the plan's
// yearly price until February 1, 2028, so Stripe files the subscription as `trialing`. The ordinary
// founder grant (foundingPaymentSignal) refuses a trialing subscription on purpose: a free trial is not a
// payment. A Founding Year is the opposite case, money moved on day one, so it is recorded here from the
// PAID CHECKOUT SESSION, which is the proof: `payment_status === 'paid'` and a non-zero `amount_total`.
//
// Called from both webhook paths (`completed` and `async_payment_succeeded`, via the one recorder list) and
// from the on-page settle. Idempotent per session id: a redelivery or the second path changes nothing.
// NEVER THROWS: a badge write must not bounce a settled payment back into a Stripe retry loop.

import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { asFoundingYearPlan, FOUNDING_YEAR, isFoundingYearMetadata } from './founding-year'

type Row = Record<string, unknown>

/** The Founding Year facts kept on `founding_members.meta.founding_year`. Read back by the Founder seat
 *  count and the finder's fee perk (LIVE-2542, LIVE-2543). */
interface FoundingYearMeta {
  plan: 'business' | 'collective'
  paid_cents: number
  method: 'card' | 'cash'
  session_id: string | null
  paid_at: string
  year_starts: string
  year_ends: string
}

/** Record a paid Founding Year for the Space a session bought it for. True when the session is a paid
 *  Founding Year (recorded now or already). Fail-quiet. */
export async function recordFoundingYearFromSession(s: Stripe.Checkout.Session): Promise<boolean> {
  try {
    const meta = (s.metadata ?? {}) as Record<string, string>
    if (meta.kind !== 'space_plan' || !isFoundingYearMetadata(meta)) return false
    if (s.payment_status !== 'paid' || typeof s.amount_total !== 'number' || s.amount_total <= 0) return false
    const plan = asFoundingYearPlan(meta.plan)
    const spaceId = meta.space_id || s.client_reference_id || null
    if (!plan || !spaceId) return false

    const db = createAdminClient() as unknown as {
      from(t: string): {
        select(c: string): { eq(c: string, v: unknown): { maybeSingle(): Promise<{ data: Row | null; error: unknown }> } }
        update(v: Row): { eq(c: string, v: unknown): Promise<{ error: unknown }> }
        insert(v: Row): Promise<{ error: unknown }>
      }
    }
    const { data: existing, error: readErr } = await db
      .from('founding_members')
      .select('id, status, locked_rate_cents, charged_at, meta')
      .eq('space_id', spaceId)
      .maybeSingle()
    if (readErr) {
      console.error('[founding-year] founder row unreadable; Founding Year NOT recorded', { spaceId, sessionId: s.id })
      return false
    }

    const paidAt = new Date((s.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString()
    const record: FoundingYearMeta = {
      plan,
      paid_cents: s.amount_total,
      method: 'card',
      session_id: s.id,
      paid_at: paidAt,
      year_starts: FOUNDING_YEAR.yearStartsAt,
      year_ends: FOUNDING_YEAR.yearEndsAt,
    }
    const oldMeta = ((existing?.meta ?? {}) as Row) || {}
    const prior = oldMeta.founding_year as Partial<FoundingYearMeta> | undefined
    if (prior?.session_id === s.id) return true // already recorded

    const write: Row = {
      kind: 'business',
      status: 'active',
      charged_at: (existing?.charged_at as string | null) ?? paidAt,
      locked_rate_cents:
        typeof existing?.locked_rate_cents === 'number' && existing.locked_rate_cents > 0
          ? existing.locked_rate_cents
          : FOUNDING_YEAR.monthlyRateCents[plan],
      // A Space that already holds a Founding Year keeps its first one (and so its seat order).
      meta: { ...oldMeta, founding_year: prior?.paid_at ? prior : record },
      updated_at: new Date().toISOString(),
    }
    const { error } = existing?.id
      ? await db.from('founding_members').update(write).eq('id', existing.id)
      : await db.from('founding_members').insert({ ...write, space_id: spaceId, profile_id: null, card_on_file: true })
    if (error) {
      console.error('[founding-year] founder row write failed; Founding Year NOT recorded', { spaceId, sessionId: s.id })
      return false
    }
    return true
  } catch (err) {
    console.error('[founding-year] record failed:', err)
    return false
  }
}
