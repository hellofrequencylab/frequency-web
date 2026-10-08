// LIVE-766. A complete total must not silently use the API's first page or an errored arm.
type Query = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> & {
  range: (from: number, to: number) => Query
  order: (column: string) => Query
}
export async function completeEarningsRead(query: Query, pageSize = 500, maximum = 10_000): Promise<{ data: unknown[]; error: null }> {
  const rows: unknown[] = []
  const ordered = query.order('id')
  for (let offset = 0; offset < maximum; offset += pageSize) {
    const { data, error } = await ordered.range(offset, offset + pageSize - 1)
    if (error) throw new Error(`earnings source unreadable: ${error.message}`)
    if (!data) throw new Error('earnings source returned no result')
    rows.push(...data)
    if (data.length < pageSize) return { data: rows, error: null }
  }
  throw new Error('earnings source exceeds the complete-report bound')
}

/** This report is denominated in USD; a mixed or unknown currency cannot be added as dollars. */
export function assertUsdEarningsRows(rows: readonly unknown[]) {
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !('currency' in row) || String(row.currency).toLowerCase() !== 'usd') throw new Error('earnings currency is not USD')
  }
}
