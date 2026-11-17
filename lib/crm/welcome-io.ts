import 'server-only'
// authz-delegated: the sent-email ledger (lifecycle_send_log, service role only) read by the staff-gated CRM roster and written by the approver-gated welcome actions, which are the gate.
// THE PERSONAL WELCOME (LIVE-2340), the IO half. A welcome is ONE row in the existing sent-email ledger
// (lifecycle_send_log, EMAIL-047): kind `personal_welcome`, dedupe key `personal_welcome:<profile id>`, so a member can be
// welcomed once and the roster reads who has been in one batched query. No new table.
//
// A SENT welcome is logged under the member's real address, so it counts toward the cross-email cap like any email they
// got (a lifecycle email waits a day behind a personal hello). A welcome MARKED by hand sent no email, so it is logged
// under `profile:<id>`, an address the cap never reads, and holds nothing back.
//
// FAIL QUIET on read: an error answers "nobody is pending" so a hiccup never paints the whole roster glowing.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import { isWelcomePending, WELCOME_KIND, welcomeDedupeKey } from './welcome'

/** Read chunk size, so a long roster never builds one oversized `in (...)` list. */
const CHUNK = 300

/** Postgres unique_violation: this member already has a welcome on record. */
const UNIQUE_VIOLATION = '23505'

/** lifecycle_send_log is not in the generated database types, so it is reached through an untyped handle. */
function ledgerClient(): SupabaseClient {
  // eslint-disable-next-line no-restricted-syntax -- lifecycle_send_log is not in lib/database.types.ts (same as lib/lifecycle/cap-io.ts)
  return createAdminClient() as unknown as SupabaseClient
}

/** The members (of those passed) who still need their personal welcome: everyone with no welcome row. */
export async function welcomePendingFor(profileIds: readonly string[]): Promise<Set<string>> {
  const candidates = [...new Set(profileIds)].filter(Boolean)
  if (candidates.length === 0) return new Set()
  try {
    const admin = ledgerClient()
    const welcomed = new Set<string>()
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const keys = candidates.slice(i, i + CHUNK).map(welcomeDedupeKey)
      const { data, error } = await admin
        .from('lifecycle_send_log')
        .select('dedupe_key')
        .eq('kind', WELCOME_KIND)
        .in('dedupe_key', keys)
      if (error) {
        log.warn('crm.welcome.read_failed', { error: error.message })
        return new Set()
      }
      for (const r of (data as { dedupe_key: string }[] | null) ?? []) welcomed.add(r.dedupe_key)
    }
    return new Set(candidates.filter((id) => isWelcomePending(welcomed.has(welcomeDedupeKey(id)))))
  } catch (err) {
    log.warn('crm.welcome.read_failed', { error: err instanceof Error ? err.message : String(err) })
    return new Set()
  }
}

/** The member's deliverable address (it lives on the auth user, not the profile), or null. */
async function memberEmail(admin: SupabaseClient, profileId: string): Promise<string | null> {
  try {
    const { data } = await admin.from('profiles').select('auth_user_id').eq('id', profileId).maybeSingle()
    const authUserId = (data as { auth_user_id: string | null } | null)?.auth_user_id
    if (!authUserId) return null
    const { data: got } = await admin.auth.admin.getUserById(authUserId)
    const email = got.user?.email?.trim().toLowerCase()
    return email && email.length >= 3 && email.length <= 320 ? email : null
  } catch {
    return null
  }
}

/** Record a member's personal welcome. `sent` = an email actually went out. Idempotent: the first record stands. */
export async function recordWelcome(input: { profileId: string; sent: boolean }): Promise<boolean> {
  const admin = ledgerClient()
  const recipient = (input.sent ? await memberEmail(admin, input.profileId) : null) ?? `profile:${input.profileId}`
  const { error } = await admin.from('lifecycle_send_log').insert({
    recipient,
    profile_id: input.profileId,
    kind: WELCOME_KIND,
    dedupe_key: welcomeDedupeKey(input.profileId),
  })
  if (error && error.code !== UNIQUE_VIOLATION) {
    log.error('crm.welcome.record_failed', { error: error.message })
    return false
  }
  return true
}
