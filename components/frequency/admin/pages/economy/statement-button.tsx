'use client'

import { FqIcon } from '@/components/frequency/icon'
import { downloadCsv } from '../csv'

// The Economy head's Statement (templates/admin/Economy.html). There is no payout ledger in the app (Stripe
// pays out on its own schedule), so the statement is what the page itself reads: net revenue for each of the
// last 12 weeks, the same spaceEarningsSummary windows the Revenue by week bars draw. The rows arrive as
// display strings from the server (dates already in the home zone), so nothing here formats a date.

export interface StatementRow {
  week: string
  net: string
}

export function StatementButton({ rows, filename }: { rows: StatementRow[] | null; filename: string }) {
  return (
    <button
      type="button"
      className="btn"
      disabled={!rows || rows.length === 0}
      title={rows ? undefined : 'Revenue could not be read just now'}
      onClick={() => rows && downloadCsv(filename, [['Week ending', 'Net revenue'], ...rows.map((r) => [r.week, r.net])])}
    >
      <FqIcon name="download" />
      Statement
    </button>
  )
}
