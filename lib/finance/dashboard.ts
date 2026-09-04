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

  // PAGINATED, and it has to be. supabase/config.toml sets `max_rows = 1000`, and PostgREST
  // enforces that silently -- no error, no flag, no partial-content signal. An unbounded select
  // therefore returns the newest 1,000 rows and every figure computed below (grand total, the
  // Foundation-vs-Labs split, byType, txnCount) is a truncated sum that LOOKS like a real one.
  // The ledger has live writers (tickets, tips, supporter, checkout), so this was a matter of
  // time rather than an if: transaction 1,001 would have quietly shrunk lifetime revenue and
  // pinned txnCount at exactly 1000 forever.
  // Ordered by id, not occurred_at: the cursor must be unique and stable, and two transactions
  // can share a timestamp.
  type TxnRow = {
    id: string
    entity_id: string
    revenue_type: string
    amount_cents: number
    currency: string
    occurred_at: string
    source_table: string
  }
  const PAGE = 1000
  const rows: TxnRow[] = []
  for (let page = 0; ; page += 1) {
    const { data, error } = await db
      .from('financial_transactions')
      .select('id, entity_id, revenue_type, amount_cents, currency, occurred_at, source_table')
      .order('id', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw new Error(`finance dashboard read failed: ${error.message}`)
    const batch = (data ?? []) as TxnRow[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  rows.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0))

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

/** Cents → a localized currency string, e.g. 1234 → "$12.34".
 *
 *  ⚠️ SAME NAME, DIFFERENT RULE from lib/pricing/display.ts formatCents (and the house formatter it
 *  delegates to, lib/commerce/types.ts formatPriceCents): THIS one always shows two decimals
 *  (2500 → "$25.00"), the price surfaces drop the cents on whole dollars (2500 → "$25"). That is
 *  deliberate here and not an accident of duplication: the only caller is the operator finance
 *  ledger (components/admin/insights/financials-tab.tsx), a tabular-nums column of recorded
 *  transactions, where "$25.00" beside "$12.34" is the accounting convention and a ragged "$25"
 *  would misalign the column. Do not re-point it at formatPriceCents without changing what that
 *  ledger renders; lib/commerce/format-cents-parity.test.ts pins the difference so it stays a
 *  decision rather than a drift. */
export function formatCents(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}
