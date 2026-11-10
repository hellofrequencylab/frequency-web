// Append to the entity-partitioned financial ledger (ADR-246, PLATFORM-VISION §1). The one
// front door for recording money, mirroring recordEngagementEvent / recordTrustSignal:
// service-role, exactly-once on idempotency_key. Every dollar carries an immutable entity
// tag (foundation | labs) and never leaks across. Callers record on the AUTHORITATIVE money
// event (a Stripe webhook / settled charge), not on intent.

import { createAdminClient } from '@/lib/supabase/admin'

// The seeded entity ids (supabase/migrations/20260618000000_entity_partition_foundation_labs.sql).
// Fixed reference data, so referencing the constants avoids a lookup on every money event.
export const ENTITY_ID = {
  foundation: 'f0000000-0000-4000-a000-000000000001',
  labs: '1ab50000-0000-4000-a000-000000000002',
} as const

type RevenueType = 'dues' | 'donation' | 'commerce' | 'payout' | 'transfer' | 'refund'

interface RecordFinancialTxnInput {
  /** entities.id — the legal entity this money belongs to (the hard partition). */
  entityId: string
  revenueType: RevenueType
  /** Cents. Negative for a refund/reversal. */
  amountCents: number
  profileId?: string | null
  currency?: string
  stripeAccountId?: string | null
  stripePaymentIntentId?: string | null
  /** Provenance, e.g. 'event_tickets'. */
  sourceTable?: string | null
  sourceId?: string | null
  /** Exactly-once across retries / redelivered webhooks. */
  idempotencyKey?: string
}

interface RecordFinancialTxnResult {
  /** false = duplicate idempotency_key; nothing recorded this time. */
  recorded: boolean
}

export async function recordFinancialTransaction(
  input: RecordFinancialTxnInput,
): Promise<RecordFinancialTxnResult> {
  const { data, error } = await createAdminClient()
    .from('financial_transactions')
    .upsert(
      {
        entity_id: input.entityId,
        revenue_type: input.revenueType,
        amount_cents: input.amountCents,
        profile_id: input.profileId ?? null,
        currency: input.currency ?? 'usd',
        stripe_account_id: input.stripeAccountId ?? null,
        stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
        source_table: input.sourceTable ?? null,
        source_id: input.sourceId ?? null,
        idempotency_key: input.idempotencyKey ?? null,
      },
      input.idempotencyKey
        ? { onConflict: 'idempotency_key', ignoreDuplicates: true }
        : { ignoreDuplicates: false },
    )
    .select('id')

  if (error) throw error
  return { recorded: (data?.length ?? 0) > 0 }
}

/** What settled to one connected account since `sinceIso`, netted of refunds, and how many sales that was.
 *  Read here, in the ledger's own service-role module, for the member tax notice (PROG-E7): the ledger has no
 *  member-facing policy, and a payer's rows never carry this account id. */
export async function connectedAccountEarningsSince(
  stripeAccountId: string,
  sinceIso: string,
): Promise<{ cents: number; transactions: number }> {
  const { data, error } = await createAdminClient()
    .from('financial_transactions')
    .select('amount_cents, revenue_type')
    .eq('stripe_account_id', stripeAccountId)
    .in('revenue_type', ['commerce', 'dues', 'donation', 'refund'])
    .gte('occurred_at', sinceIso)
    .limit(5000)
  if (error) throw error
  let cents = 0
  let transactions = 0
  for (const r of (data ?? []) as { amount_cents: number; revenue_type: string }[]) {
    cents += r.amount_cents
    if (r.revenue_type !== 'refund') transactions += 1
  }
  return { cents, transactions }
}
