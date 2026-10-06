import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// THE 3-SLOT READ (LIVE-731). One shared call for the small upcoming-events blocks (the Channel
// strip, both branches of the rail events panel): `public.upcoming_event_series` returns the next
// date of each series, so the LIMIT counts series and a daily series can no longer fill a block.
// The arguments ARE the gate (the function is service-role only and the caller reads with the admin
// client, exactly as these reads did before): pass the visibility set and, for a scoped block, the
// scope list. The caller still runs collapseSeriesRows over the result, which is the identity on a
// list that is already one row per series, so the JS fold stays the authority.

export interface UpcomingSeriesQuery {
  /** Earliest start, the block's upcoming floor (seriesUpcomingFloor). */
  from: string
  /** How many series the block shows. */
  limit: number
  visibilities: readonly string[]
  scopeIds?: readonly string[] | null
  scopeTypes?: readonly string[] | null
  /** The event columns to return. */
  columns: string
}

type UntypedRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => { select: (columns: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }
}

/** The next date of each upcoming series, at most `limit` of them, soonest first. Logs and returns
 *  [] on an error, so a block renders empty rather than throwing. */
export async function readUpcomingSeries<T>(q: UpcomingSeriesQuery): Promise<T[]> {
  const admin = createAdminClient() as unknown as UntypedRpc
  const { data, error } = await admin
    .rpc('upcoming_event_series', {
      p_from: q.from,
      p_limit: q.limit,
      p_visibilities: [...q.visibilities],
      p_scope_ids: q.scopeIds ? [...q.scopeIds] : null,
      p_scope_types: q.scopeTypes ? [...q.scopeTypes] : null,
    })
    .select(q.columns)
  if (error) {
    console.error('[events] upcoming series read failed', { error: error.message })
    return []
  }
  return (data ?? []) as T[]
}
