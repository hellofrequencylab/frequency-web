import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Find the existing 1:1 conversation between two profiles, or create one, and return its id.
 *
 * Unlike `startConversation` (app/(main)/messages/actions.ts) this does NOT gate on friendship —
 * the CALLER owns that policy. It exists for the marketplace service enquiry (ADR-596 §3/§7,
 * contact-only services), where a buyer must be able to reach a Space owner they are not friends
 * with. Every other entry point should keep using startConversation so the friendship gate holds.
 *
 * `conversations` is 1:1-only (group chats are rooms), matching startConversation's assumption.
 */
export async function findOrCreateDirectConversation(
  admin: SupabaseClient,
  profileA: string,
  profileB: string,
): Promise<string> {
  // Reuse an existing shared 1:1 thread if one is already open.
  const { data: mineRows } = await admin
    .from('conversation_participants')
    .select('conversation_id')
    .eq('profile_id', profileA)
  const myConvIds = (mineRows ?? []).map((r) => r.conversation_id as string)
  if (myConvIds.length > 0) {
    const { data: shared } = await admin
      .from('conversation_participants')
      .select('conversation_id')
      .in('conversation_id', myConvIds)
      .eq('profile_id', profileB)
      .limit(1)
      .maybeSingle()
    if (shared) return shared.conversation_id as string
  }

  // Otherwise create it and land BOTH participants (a half-created thread can't be posted into).
  const { data: conv, error } = await admin.from('conversations').insert({}).select('id').single()
  if (error || !conv) throw new Error('Failed to create conversation')
  const { error: partError } = await admin.from('conversation_participants').insert([
    { conversation_id: conv.id, profile_id: profileA },
    { conversation_id: conv.id, profile_id: profileB },
  ])
  if (partError) throw new Error('Failed to start the conversation')
  return conv.id as string
}
