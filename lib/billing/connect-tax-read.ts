// The server read behind the payout-settings tax notice (PROG-E7). Flag off: no query, no Stripe call, null.
// Earnings are the calendar-year sum of what settled to THIS member's connected account in the money ledger
// (financial_transactions.stripe_account_id), so a payer's rows never count; refunds are negative and net out.
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from './stripe'
import { connectTaxReportingEnabled, taxInfoState, taxNotice, type TaxInfoState } from './connect-tax'

const EARNING_TYPES = ['commerce', 'dues', 'donation', 'refund']
const NONE: TaxInfoState = { needsTaxInfo: false, keys: [] }

export async function memberTaxNotice(accountId: string | null, now = new Date()): Promise<string | null> {
  if (!connectTaxReportingEnabled() || !accountId) return null
  const since = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
  let cents = 0
  let transactions = 0
  const { data, error } = await createAdminClient()
    .from('financial_transactions')
    .select('amount_cents, revenue_type')
    .eq('stripe_account_id', accountId)
    .in('revenue_type', EARNING_TYPES)
    .gte('occurred_at', since)
    .limit(5000)
  if (error) console.error('[connect-tax] earnings read failed', error.message)
  for (const r of (data ?? []) as { amount_cents: number; revenue_type: string }[]) {
    cents += r.amount_cents
    if (r.revenue_type !== 'refund') transactions += 1
  }
  let info = NONE
  if (stripe) {
    try {
      info = taxInfoState(await stripe.accounts.retrieve(accountId))
    } catch (e) {
      console.error('[connect-tax] account read failed', e instanceof Error ? e.message : e)
    }
  }
  return taxNotice({ gross: { cents, transactions }, info })
}
