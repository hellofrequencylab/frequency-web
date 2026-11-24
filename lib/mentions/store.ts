import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from '@/lib/log'
import { routeNotification } from '@/lib/notifications/router'
import { excerpt } from '@/lib/calendar/plan-notify-core'
import type { Reference } from './references'

// WRITING TAGS FROM A CHAT SEND (LIVE-2525). The room and DM send actions already write their message
// with the service-role client after proving the sender may post, so the tags they carry are written
// the same way, by the same action, after the same proof. The caller hands in only references it has
// already checked: people who can read the conversation, items the sender picked from a list their
// own session produced. Best effort: a failed write costs the backlink, never the message.

type SourceType = 'room_message' | 'direct_message'

export async function recordMessageReferences(
  admin: SupabaseClient,
  input: { sourceType: SourceType; sourceId: string; createdBy: string; spaceId?: string | null; refs: readonly Reference[] },
): Promise<void> {
  if (input.refs.length === 0) return
  const rows = input.refs.map((r) => ({
    source_type: input.sourceType,
    source_id: input.sourceId,
    target_type: r.kind,
    target_id: r.id,
    space_id: input.spaceId ?? null,
    created_by: input.createdBy,
  }))
  const { error } = await admin.from('mentions').upsert(rows, { onConflict: 'source_type,source_id,target_type,target_id', ignoreDuplicates: true })
  if (error) log.warn('mentions.record_failed', { source_type: input.sourceType, error: error.message })
}

/** Tell each person tagged in a room message. They are room members (the caller proved it). */
export async function notifyRoomMentions(input: {
  roomId: string
  roomName: string
  authorId: string
  authorName: string
  body: string
  profileIds: readonly string[]
}): Promise<void> {
  for (const profileId of input.profileIds) {
    if (profileId === input.authorId) continue
    try {
      await routeNotification(
        'item.mention',
        { profileId },
        {
          actorId: input.authorId,
          title: `${input.authorName} mentioned you in ${input.roomName}`,
          body: excerpt(input.body),
          url: `/messages/r/${input.roomId}`,
          tag: `room-mention:${input.roomId}`,
          referenceType: 'room',
          referenceId: input.roomId,
        },
      )
    } catch (err) {
      log.warn('mentions.room_notify_failed', { room_id: input.roomId, error: err instanceof Error ? err.message : String(err) })
    }
  }
}
