// Append to the entity-partitioned financial ledger (ADR-246, PLATFORM-VISION §1). The one
// front door for recording money, mirroring recordEngagementEvent / recordTrustSignal:
// service-role, exactly-once on idempotency_key. Every dollar carries an immutable entity
// tag (foundation | labs) and never leaks across. Callers record on the AUTHORITATIVE money
// event (a Stripe webhook / settled charge), not on intent.

import { createAdminClient } from '@/lib/supabase/admin'

export type RevenueType = 'dues' | 'donation' | 'commerce' | 'payout' | 'transfer' | 'refund'

export interface RecordFinancialTxnInput {
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

export interface RecordFinancialTxnResult {
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
