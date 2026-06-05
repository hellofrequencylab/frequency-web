'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export interface MessagesSummary {
  totalUnread: number
  rooms: Array<{
    id: string
    name: string
    visibility: 'public' | 'private' | 'circle' | 'hub' | 'nexus' | 'outpost'
    last_message_at: string | null
    unread: number
  }>
  conversations: Array<{
    id: string
    name: string | null
    participants: Array<{ id: string; display_name: string; handle: string; avatar_url: string | null }>
    lastMessage: { body: string; created_at: string } | null
    unread: number
  }>
}

export async function fetchMessagesSummary(): Promise<MessagesSummary> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { totalUnread: 0, rooms: [], conversations: [] }

  // RLS convergence surface 5 (migration 20260602195209): rooms + DMs read on the
  // user client (am_room_member / am_participant policies); DM participant profiles
  // come from the message_peer_profiles DEFINER RPC.
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!myProfile) return { totalUnread: 0, rooms: [], conversations: [] }

  const myProfileId = myProfile.id as string

  const { data: peerRows } = await (supabase as unknown as SupabaseClient).rpc('message_peer_profiles')
  const peerMap = new Map(
    ((peerRows ?? []) as { id: string; display_name: string; handle: string; avatar_url: string | null }[])
      .map(p => [p.id, p]),
  )

  // ── Rooms (top 5 by recent activity) ───────────────────────────────
  const { data: myRoomMemberships } = await supabase
    .from('room_members')
    .select('room_id, last_read_at')
    .eq('profile_id', myProfileId)

  const roomReadMap: Record<string, string | null> = {}
  for (const m of myRoomMemberships ?? []) {
    roomReadMap[m.room_id as string] = (m.last_read_at as string | null) ?? null
  }
  const roomIds = (myRoomMemberships ?? []).map(m => m.room_id as string)

  let rooms: MessagesSummary['rooms'] = []
  if (roomIds.length > 0) {
    const { data: roomsData } = await supabase
      .from('rooms')
      .select('id, name, visibility, last_message_at')
      .in('id', roomIds)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(5)

    // Count unread messages per room
    const roomList = (roomsData ?? []) as Array<{ id: string; name: string; visibility: MessagesSummary['rooms'][number]['visibility']; last_message_at: string | null }>

    rooms = await Promise.all(roomList.map(async r => {
      const lastRead = roomReadMap[r.id]
      const sinceCutoff = lastRead ?? '1970-01-01T00:00:00Z'
      const { count } = await supabase
        .from('room_messages')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', r.id)
        .neq('author_id', myProfileId)
        .gt('created_at', sinceCutoff)
      return { ...r, unread: count ?? 0 }
    }))
  }

  // ── DMs (top 5 by recent activity) — 1:1 only (Phase B) ────────────
  // Exclude migrated group threads (they live as private rooms now).
  const { data: myPartsRaw } = await (supabase as unknown as SupabaseClient)
    .from('conversation_participants')
    .select('conversation_id, last_read_at, conversations!conversation_id(id, name, migrated_to_room_id)')
    .eq('profile_id', myProfileId)
  const myParts = ((myPartsRaw ?? []) as unknown as Array<{
    conversation_id: string
    last_read_at: string | null
    conversations: { id: string; name: string | null; migrated_to_room_id: string | null } | null
  }>).filter((p) => !p.conversations?.migrated_to_room_id)

  const convIds = myParts.map(p => p.conversation_id as string)
  const dmReadMap: Record<string, string | null> = {}
  const convNameMap: Record<string, string | null> = {}
  for (const p of myParts ?? []) {
    const cid = p.conversation_id as string
    dmReadMap[cid] = (p.last_read_at as string | null) ?? null
    const c = (p as unknown as { conversations: { name: string | null } | null }).conversations
    convNameMap[cid] = c?.name ?? null
  }

  const conversations: MessagesSummary['conversations'] = []
  if (convIds.length > 0) {
    // Get other participants
    const { data: others } = await supabase
      .from('conversation_participants')
      .select('conversation_id, profile_id')
      .in('conversation_id', convIds)
      .neq('profile_id', myProfileId)

    const partsByConv: Record<string, MessagesSummary['conversations'][number]['participants']> = {}
    for (const o of others ?? []) {
      const cid = o.conversation_id as string
      const prof = peerMap.get(o.profile_id as string)
      if (!prof) continue
      if (!partsByConv[cid]) partsByConv[cid] = []
      partsByConv[cid].push(prof)
    }

    // Get last message per conv + unread count
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('conversation_id, sender_id, body, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(convIds.length * 10)

    const lastMsgMap: Record<string, { body: string; created_at: string }> = {}
    const unreadCountMap: Record<string, number> = {}
    for (const cid of convIds) unreadCountMap[cid] = 0

    for (const m of recentMessages ?? []) {
      const cid = m.conversation_id as string
      if (!lastMsgMap[cid]) {
        lastMsgMap[cid] = { body: m.body as string, created_at: m.created_at as string }
      }
      if (m.sender_id !== myProfileId) {
        const lastRead = dmReadMap[cid]
        if (!lastRead || new Date(m.created_at as string) > new Date(lastRead)) {
          unreadCountMap[cid] = (unreadCountMap[cid] ?? 0) + 1
        }
      }
    }

    const sortedConvIds = convIds
      .map(cid => ({ cid, time: lastMsgMap[cid]?.created_at ?? '1970-01-01T00:00:00Z' }))
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 5)
      .map(x => x.cid)

    for (const cid of sortedConvIds) {
      conversations.push({
        id: cid,
        name: convNameMap[cid] ?? null,
        participants: partsByConv[cid] ?? [],
        lastMessage: lastMsgMap[cid] ?? null,
        unread: unreadCountMap[cid] ?? 0,
      })
    }
  }

  const totalUnread =
    rooms.reduce((s, r) => s + r.unread, 0) +
    conversations.reduce((s, c) => s + c.unread, 0)

  return { totalUnread, rooms, conversations }
}
