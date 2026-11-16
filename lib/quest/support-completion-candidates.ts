import type { PolicyReadClient } from './support-policy-read'
import { isPolicyDay, parseCompletionPolicy } from './support-policy.ts'

type CandidateRead = { available: true; planIds: string[] } | {
  available: false; planIds: []; reason: 'invalid_day' | 'read_failed' | 'invalid_page' | 'invalid_policy' | 'page_limit'
}
const PAGE = 100
const MAX_PAGES = 100

/** Recorded contracts, not current practice categories, choose prospective completion checks.
 * Completed enrollments stay eligible as candidates for the existing idempotent purse-recovery path.
 * No completion or reward is granted here: the authoritative evaluator still decides each plan. */
export async function readRecordedCompletionPlanIds(client: PolicyReadClient, profileId: string, loggedDay: string): Promise<CandidateRead> {
  if (!isPolicyDay(loggedDay)) return { available: false, planIds: [], reason: 'invalid_day' }
  const plans = new Set<string>()
  let cursor: string | null = null
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      let query = client.from('journey_enrollments').select('id, plan_id, completion_policy')
        .eq('profile_id', profileId).not('completion_policy', 'is', null)
        .order('id', { ascending: true }).limit(PAGE)
      if (cursor) query = query.gt('id', cursor)
      const { data, error } = await query
      if (error || !Array.isArray(data)) return { available: false, planIds: [], reason: 'read_failed' }
      // Provider max_rows may be below PAGE; only an empty keyset page proves the end.
      if (data.length === 0) return { available: true, planIds: [...plans] }
      for (const row of data as unknown as Array<{ id?: unknown; plan_id?: unknown; completion_policy?: unknown }>) {
        if (typeof row?.id !== 'string' || !row.id || cursor !== null && row.id <= cursor || typeof row.plan_id !== 'string' || !row.plan_id) {
          return { available: false, planIds: [], reason: 'invalid_page' }
        }
        cursor = row.id
        const raw = row.completion_policy
        // Unknown prospective versions are not evidence for this V2 completion contract.
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw as Record<string, unknown>).version !== 2) continue
        const policy = parseCompletionPolicy(raw)
        if (!policy) return { available: false, planIds: [], reason: 'invalid_policy' }
        if (loggedDay >= policy.windowStart && loggedDay <= policy.windowEnd) plans.add(row.plan_id)
      }
    }
  } catch { return { available: false, planIds: [], reason: 'read_failed' } }
  return { available: false, planIds: [], reason: 'page_limit' }
}
