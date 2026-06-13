// Read-only finance dashboard data (ADR-246, PLATFORM-VISION §1). Aggregates the
// entity-partitioned financial_transactions ledger so an operator can see money by legal
// entity — Foundation (nonprofit) vs Labs (for-profit) — which the partition exists to keep
// separate. Service-role read behind the page's janitor gate. The ledger fills as money
// flows (tickets, dues, donations, commerce, payouts) are wired to append to it; until then
// this reads zeros, which is correct, not broken.

import { createAdminClient } from '@/lib/supabase/admin'

export interface EntityFinance {
  entityKey: string
  entityName: string
  /** 'nonprofit' | 'for_profit'. */
  kind: string
  /** Net cents across all this entity's transactions. */
  totalCents: number
  /** revenue_type → net cents. */
  byType: Record<string, number>
  txnCount: number
}

export interface FinanceTxn {
  id: string
  entityKey: string
  revenueType: string
  amountCents: number
  currency: string
  occurredAt: string
  sourceTable: string | null
}

export interface FinanceSummary {
  /** One row per known entity (Foundation + Labs always present, even at 0). */
  entities: EntityFinance[]
  grandTotalCents: number
  txnCount: number
  recent: FinanceTxn[]
}

export async function getFinanceSummary(recentLimit = 25): Promise<FinanceSummary> {
  const db = createAdminClient()

  const { data: entRows } = await db.from('entities').select('id, key, name, kind')
  const ents = new Map((entRows ?? []).map((e) => [e.id, e]))

  const { data: txns } = await db
    .from('financial_transactions')
    .select('id, entity_id, revenue_type, amount_cents, currency, occurred_at, source_table')
    .order('occurred_at', { ascending: false })

  const rows = txns ?? []

  // Seed every known entity so Foundation + Labs always show (the partition is the point).
  const byEntity = new Map<string, EntityFinance>()
  for (const e of entRows ?? []) {
    byEntity.set(e.id, {
      entityKey: e.key,
      entityName: e.name,
      kind: e.kind,
      totalCents: 0,
      byType: {},
      txnCount: 0,
    })
  }

  let grand = 0
  for (const t of rows) {
    const ef = byEntity.get(t.entity_id)
    if (!ef) continue
    ef.totalCents += t.amount_cents
    ef.byType[t.revenue_type] = (ef.byType[t.revenue_type] ?? 0) + t.amount_cents
    ef.txnCount += 1
    grand += t.amount_cents
  }

  const recent: FinanceTxn[] = rows.slice(0, recentLimit).map((t) => ({
    id: t.id,
    entityKey: ents.get(t.entity_id)?.key ?? 'unknown',
    revenueType: t.revenue_type,
    amountCents: t.amount_cents,
    currency: t.currency,
    occurredAt: t.occurred_at,
    sourceTable: t.source_table,
  }))

  return {
    entities: [...byEntity.values()].sort((a, b) => a.entityKey.localeCompare(b.entityKey)),
    grandTotalCents: grand,
    txnCount: rows.length,
    recent,
  }
}

/** Cents → a localized currency string, e.g. 1234 → "$12.34". */
export function formatCents(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}
