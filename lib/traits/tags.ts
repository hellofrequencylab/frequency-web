// Member tag assignment (ADR-068). The ONLY sanctioned way to write member_tags —
// every assignment is validated against the registry so tags stay governed. Writes
// use the service role (admin); member-facing reads go through RLS. member_tags
// isn't in database.types yet, so we cast (repo convention; see lib/ai/memory.ts).
//
// authz-delegated: caller-trusted system write. The upsert is intrinsically scoped to the
// passed profile_id (the row + the (profile_id, tag_key) conflict key), and every caller is
// server-side (onboarding/attribution) which authorizes the profileId before tagging.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTagKey } from './registry'

export interface AssignTagOptions {
  source?: string
  assignedBy?: string | null
  expiresAt?: string | null
  context?: Record<string, unknown>
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** Assign a tag to a member. Idempotent (no-op if already present). Throws on an
 *  unregistered tag key so typos can't create orphan tags. */
export async function assignTag(profileId: string, tagKey: string, opts: AssignTagOptions = {}): Promise<void> {
  if (!isTagKey(tagKey)) throw new Error(`assignTag: unknown tag key "${tagKey}" — register it in lib/traits/registry.ts first`)
  await db()
    .from('member_tags')
    .upsert(
      {
        profile_id: profileId,
        tag_key: tagKey,
        source: opts.source ?? 'system',
        assigned_by: opts.assignedBy ?? null,
        expires_at: opts.expiresAt ?? null,
        context: opts.context ?? {},
      },
      { onConflict: 'profile_id,tag_key', ignoreDuplicates: true },
    )
}

