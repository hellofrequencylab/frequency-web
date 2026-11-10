// Carry an invite link's attribution from the lead onto the member (LIVE-2234).
//
// A /start page stores the link's params on the lead contact (contacts.meta.funnel, written by
// captureLead). When that person finishes the induction, this copies the record onto
// profiles.meta.funnel so the member, not only the lead, says which region, area, Channel, source and
// send route brought them. First stamp wins: a member who already carries one keeps it. Server-only,
// best-effort, never throws. Writes only the caller's own profile, read from their own email's lead row.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { mergeProfileMeta } from '@/lib/profiles/meta'

type MetaClient = Parameters<typeof mergeProfileMeta>[0]

/** `admin` reads the lead row (a root-space contact the member's session cannot see); the member's own
 *  session client writes their profile meta. The caller (the induction action) owns both. */
export async function stampFunnelFromLead(
  admin: SupabaseClient<Database>,
  client: MetaClient,
  profileId: string,
  email: string | null | undefined,
  profileMeta: Record<string, unknown>,
): Promise<void> {
  try {
    if (!email || profileMeta.funnel) return
    const rootId = await loadRootSpaceId()
    if (!rootId) return
    const { data } = await admin
      .from('contacts')
      .select('meta')
      .eq('space_id', rootId)
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()
    const meta = (data as { meta: unknown } | null)?.meta
    if (!meta || typeof meta !== 'object') return
    const { funnel, lead_source, host } = meta as Record<string, unknown>
    if (!funnel || typeof funnel !== 'object') return
    await mergeProfileMeta(client, profileId, {
      funnel,
      lead_source: lead_source ?? null,
      ...(host && typeof host === 'object' ? { host } : {}),
    })
  } catch {
    /* attribution is best-effort; it never blocks onboarding */
  }
}
