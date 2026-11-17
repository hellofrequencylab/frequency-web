import 'server-only'
// authz-delegated: a platform ledger (member_welcomes, service role only) read by the staff-gated CRM roster and written by the approver-gated welcome actions, which are the gate.
// THE PERSONAL WELCOME (LIVE-2340), the IO half. Who has had their personal welcome, read in ONE batched query for a
// whole roster, and the record a welcome send (or a "mark as welcomed") writes. FAIL QUIET on read: an error answers
// "nobody is pending" so a missing table or a hiccup never paints the whole roster glowing.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import { isWelcomePending } from './welcome'

/** member_welcomes is newer than the generated database types, so it is reached through an untyped handle. */
function welcomesClient(): SupabaseClient {
  // eslint-disable-next-line no-restricted-syntax -- member_welcomes (LIVE-2340) is not in lib/database.types.ts yet
  return createAdminClient() as unknown as SupabaseClient
}

/** Read chunk size, so a long roster never builds one oversized `in (...)` list. */
const CHUNK = 500

/** The members (of those passed) who still need their personal welcome: everyone with no row in member_welcomes. */
export async function welcomePendingFor(profileIds: readonly string[]): Promise<Set<string>> {
  const candidates = [...new Set(profileIds)].filter(Boolean)
  const pending = new Set<string>()
  if (candidates.length === 0) return pending
  try {
    const admin = welcomesClient()
    const welcomed = new Set<string>()
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const ids = candidates.slice(i, i + CHUNK)
      const { data, error } = await admin.from('member_welcomes').select('profile_id').in('profile_id', ids)
      if (error) {
        log.warn('crm.welcome.read_failed', { error: error.message })
        return pending
      }
      for (const r of (data as { profile_id: string }[] | null) ?? []) welcomed.add(r.profile_id)
    }
    for (const id of candidates) if (isWelcomePending(welcomed.has(id))) pending.add(id)
  } catch (err) {
    log.warn('crm.welcome.read_failed', { error: err instanceof Error ? err.message : String(err) })
    return new Set()
  }
  return pending
}

/** Record a member's personal welcome. Idempotent: a second record keeps the first. */
export async function recordWelcome(input: {
  profileId: string
  sentBy: string
  campaignId?: string | null
}): Promise<boolean> {
  const admin = welcomesClient()
  const { error } = await admin
    .from('member_welcomes')
    .upsert(
      { profile_id: input.profileId, sent_by: input.sentBy, campaign_id: input.campaignId ?? null },
      { onConflict: 'profile_id', ignoreDuplicates: true },
    )
  if (error) {
    log.error('crm.welcome.record_failed', { error: error.message })
    return false
  }
  return true
}

