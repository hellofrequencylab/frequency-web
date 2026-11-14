import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
export type PolicyReadClient = Pick<SupabaseClient<Database>, 'from'>
import { countRecordedSupportDays, parseCompletionPolicy, type CompletionPolicy, type SupportLog } from './support-policy'

interface EnrollmentRow { completion_policy?: unknown }
type PolicyRead = { available: true; policy: CompletionPolicy | null } | { available: false; policy: null }

/** Oldest active contract wins. Once all are completed, the latest contract supports a payout retry.
 * Source is internal owner-scoped enrollment data, never a client-supplied policy. */
export async function readEnrollmentPolicy(client: PolicyReadClient, profileId: string, journeyId: string): Promise<PolicyRead> {
  try {
    const active = await client.from('journey_enrollments').select('completion_policy')
      .eq('profile_id', profileId).eq('plan_id', journeyId).is('completed_at', null)
      .order('started_at', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle()
    if (active.error) return { available: false, policy: null }
    let row = active.data as unknown as EnrollmentRow | null
    if (!row) {
      const completed = await client.from('journey_enrollments').select('completion_policy')
        .eq('profile_id', profileId).eq('plan_id', journeyId).not('completed_at', 'is', null)
        .order('started_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle()
      if (completed.error) return { available: false, policy: null }
      row = completed.data as unknown as EnrollmentRow | null
    }
    if (row?.completion_policy == null) return { available: true, policy: null }
    const policy = parseCompletionPolicy(row.completion_policy)
    return policy ? { available: true, policy } : { available: false, policy: null }
  } catch { return { available: false, policy: null } }
}

const PAGE = 1000
const MAX_PAGES = 100

/** Bounded, complete member read. A failed later page never becomes a successful smaller count. */
export async function readRecordedSupportDays(client: PolicyReadClient, profileId: string, policy: CompletionPolicy, today: string): Promise<{ available: boolean; distinctDays: number; unknownLogs: number }> {
  const rows: SupportLog[] = []
  let cursor: string | null = null
  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let query = client.from('practice_logs')
        .select('id, logged_for, support_pillar_ids, support_evidence_version, pillar_id, secondary_pillar_id, primary_pct')
        .eq('profile_id', profileId).gte('logged_for', policy.windowStart)
        .lte('logged_for', policy.windowEnd).lte('logged_for', today)
        .order('id', { ascending: true }).limit(PAGE)
      if (cursor) query = query.gt('id', cursor)
      const { data, error } = await query
      if (error || !Array.isArray(data)) return { available: false, distinctDays: 0, unknownLogs: 0 }
      // A provider can return fewer than PAGE rows. Only an empty keyset page proves completion.
      if (data.length === 0) return { available: true, ...countRecordedSupportDays(rows, policy, today) }
      const batch = data as unknown as Array<SupportLog & { id?: unknown }>
      for (const row of batch) {
        if (typeof row.id !== 'string' || (cursor != null && row.id <= cursor)) return { available: false, distinctDays: 0, unknownLogs: 0 }
        cursor = row.id
        rows.push(row)
      }
    }
  } catch { /* no raw provider errors or private practice data in diagnostics */ }
  return { available: false, distinctDays: 0, unknownLogs: 0 }
}
