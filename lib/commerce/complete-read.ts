// LIVE-766. Every bounded page must succeed before a total is presented.
type Query = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> & {
  range: (from: number, to: number) => Query
  order: (column: string, options?: { ascending: boolean }) => Query
  gt: (column: string, value: string) => Query
}
/** ID keysets avoid offset skips/repeats when earlier rows are inserted or removed.
 * Reads span a window, not a transaction snapshot; writes during that window can still change totals. */
export async function completeEarningsRead(query: Query, pageSize = 500, maximum = 10_000): Promise<{ data: unknown[]; error: null }> {
  const rows: unknown[] = []
  let ordered = query.order('id', { ascending: true })
  let last: string | null = null
  for (let read = 0; read < maximum; read += pageSize) {
    const { data, error } = await ordered.range(0, pageSize - 1)
    if (error) throw new Error(`earnings source unreadable: ${error.message}`)
    if (!data) throw new Error('earnings source returned no result')
    for (const row of data) {
      const id = row && typeof row === 'object' && 'id' in row ? row.id : null
      if (typeof id !== 'string' || !id || (last !== null && id <= last)) throw new Error('earnings source ID order is incomplete')
      last = id
      rows.push(row)
    }
    if (data.length < pageSize) return { data: rows, error: null }
    ordered = ordered.gt('id', last!)
  }
  throw new Error('earnings source exceeds the complete-report bound')
}
/** This report is denominated in USD; a mixed or unknown currency cannot be added as dollars. */
export function assertUsdEarningsRows(rows: readonly unknown[]) {
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !('currency' in row) || String(row.currency).toLowerCase() !== 'usd') throw new Error('earnings currency is not USD')
  }
}
