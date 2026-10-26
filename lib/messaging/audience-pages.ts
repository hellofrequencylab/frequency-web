// Keep audience reads below the Data API row ceiling and advance by a stable unique id.
// A failed or oversized read must never return a plausible but incomplete recipient list.
export const AUDIENCE_PAGE_SIZE = 500
export const AUDIENCE_ROW_LIMIT = 20_000
export const AUDIENCE_ID_BATCH = 100

type AudiencePage<T> = { data: T[] | null; error: { message: string } | null }

export async function readAudiencePages<T extends { id: string }>(
  page: (after: string | null) => PromiseLike<AudiencePage<T>>,
): Promise<T[]> {
  const rows: T[] = []
  let after: string | null = null
  for (;;) {
    const { data, error } = await page(after)
    if (error || !data) throw new Error('Could not read the complete audience')
    for (const row of data) {
      if (typeof row.id !== 'string' || !row.id || (after !== null && row.id <= after)) {
        throw new Error('Audience cursor did not advance')
      }
      after = row.id
      rows.push(row)
      if (rows.length > AUDIENCE_ROW_LIMIT) throw new Error('Audience exceeds the bounded read limit')
    }
    if (data.length < AUDIENCE_PAGE_SIZE) return rows
  }
}
