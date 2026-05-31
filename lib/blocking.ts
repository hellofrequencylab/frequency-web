// Blocking (ADR-036): a member blocks another so they cannot DM each other and
// are hidden from each other's surfaces. Blocking also unfriends. Server-only.
//
// blocked_users is a new table; until `supabase gen types` is re-run it is not in
// the generated Database types, so this module uses an untyped admin handle. Drop
// the cast after regen (see docs/START-HERE.md).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export interface BlockedProfile {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) return
  const client = db()
  await client
    .from('blocked_users')
    .upsert(
      { blocker_id: blockerId, blocked_id: blockedId },
      { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
    )
  // Blocking implies unfriending: drop any friendship row (canonical ordering).
  const [a, b] = blockerId < blockedId ? [blockerId, blockedId] : [blockedId, blockerId]
  await client.from('friendships').delete().match({ user_a_id: a, user_b_id: b })
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await db().from('blocked_users').delete().match({ blocker_id: blockerId, blocked_id: blockedId })
}

/** True if either user has blocked the other. */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const { data } = await db().rpc('is_blocked_between', { a, b })
  return data === true
}

/** True if `blockerId` has blocked `blockedId` (one direction). */
export async function hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const { data } = await db()
    .from('blocked_users')
    .select('id')
    .match({ blocker_id: blockerId, blocked_id: blockedId })
    .maybeSingle()
  return !!data
}

export async function getBlockedProfiles(blockerId: string): Promise<BlockedProfile[]> {
  const { data } = await db()
    .from('blocked_users')
    .select('blocked:profiles!blocked_users_blocked_id_fkey(id, display_name, handle, avatar_url)')
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false })
  const rows = (data as { blocked: BlockedProfile | null }[] | null) ?? []
  return rows.map((r) => r.blocked).filter((p): p is BlockedProfile => !!p)
}
