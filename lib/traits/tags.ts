// Member tag assignment (ADR-068). The ONLY sanctioned way to write member_tags —
// every assignment is validated against the registry so tags stay governed. Writes
// use the service role (admin); member-facing reads go through RLS. member_tags
// isn't in database.types yet, so we cast (repo convention; see lib/ai/memory.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTagKey } from './registry'

export interface MemberTag {
  tagKey: string
  source: string
  assignedAt: string
  expiresAt: string | null
  context: Record<string, unknown>
}

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

/** Remove a tag from a member. */
export async function removeTag(profileId: string, tagKey: string): Promise<void> {
  await db().from('member_tags').delete().eq('profile_id', profileId).eq('tag_key', tagKey)
}

/** All currently-effective tags for a member (expired ones excluded). */
export async function getMemberTags(profileId: string): Promise<MemberTag[]> {
  const { data } = await db()
    .from('member_tags')
    .select('tag_key, source, assigned_at, expires_at, context')
    .eq('profile_id', profileId)
  const nowMs = Date.now()
  return ((data ?? []) as Array<{ tag_key: string; source: string; assigned_at: string; expires_at: string | null; context: Record<string, unknown> }>)
    .filter((r) => !r.expires_at || Date.parse(r.expires_at) > nowMs)
    .map((r) => ({
      tagKey: r.tag_key,
      source: r.source,
      assignedAt: r.assigned_at,
      expiresAt: r.expires_at,
      context: r.context ?? {},
    }))
}
