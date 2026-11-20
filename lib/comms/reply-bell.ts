// WHERE A REPLY BELL SENDS ITS OWNER (EMAIL-074).
//
// notifyConversationReply (lib/comms/inbound.ts) rings the thread's assignee, else its owner. Those
// people are not all staff: a leader's thread (kind 'leader') belongs to the leader, whose inbox is
// /lead/inbox, and a Space-lane thread (space_id set) belongs to that Space's owner or agent, whose inbox
// is /spaces/<slug>/crm/conversations. Only a platform thread (no Space, not a leader's) is staff work
// at /admin/crm/conversations. The bell row can carry only a type and a UUID (no space column, and
// notificationHref is pure), so the lane rides in reference_type and the Space slug is resolved at click
// time by resolveSpaceConversationHref, behind /spaces/operating?conversation=<id>.

import { createAdminClient } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ReplyBellReferenceType = 'leader_conversation' | 'space_conversation' | 'conversation'

/** The reference_type a reply bell row carries, from the thread's lane. PURE. */
export function replyBellReferenceType(conv: { kind: string | null; spaceId: string | null }): ReplyBellReferenceType {
  if (conv.kind === 'leader') return 'leader_conversation'
  if (conv.spaceId) return 'space_conversation'
  return 'conversation'
}

/**
 * The Space console thread a Space-lane reply bell opens, or null when it cannot be addressed for this
 * viewer. Only the thread's owner or assignee is sent on (the bell's own recipients), so a guessed id
 * never reveals which Space a thread lives in. The console page still runs its own manage gate and
 * tenancy check. FAIL-SAFE: null on any miss or error.
 */
export async function resolveSpaceConversationHref(
  conversationId: string | null | undefined,
  viewerProfileId: string | null | undefined,
): Promise<string | null> {
  const id = (conversationId ?? '').trim()
  if (!viewerProfileId || !UUID_RE.test(id)) return null
  try {
    const db = createAdminClient()
    const { data: conv } = await db
      .from('comms_conversations')
      .select('id, space_id, owner_profile_id, assigned_to')
      .eq('id', id)
      .maybeSingle()
    if (!conv?.space_id) return null
    if (conv.owner_profile_id !== viewerProfileId && conv.assigned_to !== viewerProfileId) return null
    const { data: space } = await db.from('spaces').select('slug').eq('id', conv.space_id).maybeSingle()
    const slug = space?.slug?.trim()
    if (!slug) return null
    return `/spaces/${encodeURIComponent(slug)}/crm/conversations?id=${encodeURIComponent(id)}`
  } catch {
    return null
  }
}
