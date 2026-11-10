// The server read behind the payout-settings tax notice (PROG-E7). Flag off: no query, no Stripe call, null.
// Earnings are the calendar-year sum of what settled to THIS member's connected account in the money ledger
// (lib/finance/record.ts connectedAccountEarningsSince), so a payer's rows never count; refunds net out.
import { connectedAccountEarningsSince } from '@/lib/finance/record'
import { stripe } from './stripe'
import { connectTaxReportingEnabled, taxInfoState, taxNotice, type TaxInfoState } from './connect-tax'

const NONE: TaxInfoState = { needsTaxInfo: false, keys: [] }

export async function memberTaxNotice(accountId: string | null, now = new Date()): Promise<string | null> {
  if (!connectTaxReportingEnabled() || !accountId) return null
  const since = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
  let gross = { cents: 0, transactions: 0 }
  try {
    gross = await connectedAccountEarningsSince(accountId, since)
  } catch (e) {
    console.error('[connect-tax] earnings read failed', e instanceof Error ? e.message : e)
  }
  let info = NONE
  if (stripe) {
    try {
      info = taxInfoState(await stripe.accounts.retrieve(accountId))
    } catch (e) {
      console.error('[connect-tax] account read failed', e instanceof Error ? e.message : e)
    }
  }
  return taxNotice({ gross, info })
}
