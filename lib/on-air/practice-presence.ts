/** PostgREST's configured response cap is 1,000 rows. Read every ordered page before
 * counting distinct profiles so a busy day cannot silently truncate the presence total. */
export const PRACTICE_PRESENCE_PAGE_SIZE = 1000

type PresenceRow = { profile_id: string | null }
type PresencePage = { data: PresenceRow[] | null; error: unknown }

interface PresenceQuery extends PromiseLike<PresencePage> {
  eq(column: 'logged_for', value: string): PresenceQuery
  order(column: 'id', options: { ascending: true }): PresenceQuery
  range(from: number, to: number): PresenceQuery
}

interface PresenceClient {
  from(table: 'practice_logs'): {
    select(columns: 'id, profile_id'): PresenceQuery
  }
}

/** Count members with a practice log on the supplied member-local day.
 *  Returns zero on an incomplete read rather than presenting a misleading partial count, unless the caller
 *  asks for `throwOnError` (the cached path, which must not store a failure as a count). */
export async function countPracticedToday(
  client: PresenceClient,
  day: string,
  opts: { throwOnError?: boolean } = {},
): Promise<number> {
  const profiles = new Set<string>()
  for (let from = 0; ; from += PRACTICE_PRESENCE_PAGE_SIZE) {
    const { data, error } = await client
      .from('practice_logs')
      .select('id, profile_id')
      .eq('logged_for', day)
      .order('id', { ascending: true })
      .range(from, from + PRACTICE_PRESENCE_PAGE_SIZE - 1)

    if (error || !data) {
      // A caller that caches the total passes throwOnError so a failed read is never stored as zero.
      if (opts.throwOnError) throw new Error('practice presence read failed')
      return 0
    }
    for (const row of data) {
      if (row.profile_id) profiles.add(row.profile_id)
    }
    if (data.length < PRACTICE_PRESENCE_PAGE_SIZE) return profiles.size
  }
}
