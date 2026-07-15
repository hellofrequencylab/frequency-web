'use server'

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

/** The caller's TOTAL unread message count (1:1 DMs + rooms) in ONE grouped read, for the
 *  header Messages badge (surfaced on mobile + desktop). Backed by the my_unread_message_count
 *  RPC (migration 20261154000000), which scopes to the caller's own memberships via auth.uid().
 *  FAIL-SAFE: any error — including the RPC not yet existing pre-migration — returns 0, so the
 *  badge simply stays hidden rather than breaking the shell. Cheap enough to fetch on every load. */
export async function getMessagesUnreadCount(): Promise<number> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string,
    ) => Promise<{ data: number | null; error: unknown }>)('my_unread_message_count')
    if (error) return 0
    return typeof data === 'number' ? data : 0
  } catch {
    return 0
  }
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

  const { data: peerRows } = await (supabase).rpc('message_peer_profiles')
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
  const { data: myPartsRaw } = await (supabase)
    .from('conversation_participants')
    .select('conversation_id, last_read_at, conversations!conversation_id(id, name, migrated_to_room_id)')
    .eq('profile_id', myProfileId)
  const myParts = ((myPartsRaw ?? []) as unknown as Array<{
    conversation_id: string
    last_read_at: string | null
    conversations: { id: string; name: string | null; migrated_to_room_id: string | null } | null
  }>).filter((p) => !p.conversations?.migrated_to_room_id)

  const convIds = myParts.map(p => p.conversation_id as string)
  const convNameMap: Record<string, string | null> = {}
  for (const p of myParts ?? []) {
    const cid = p.conversation_id as string
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

    // Per-conversation newest message + unread count via the window RPC (no shared-budget
    // starvation across busy threads; matches the inbox). Untyped RPC handle (ADR-246).
    type ConvSummary = {
      conversation_id: string
      last_body: string | null
      last_created_at: string | null
      unread_count: number
    }
    const { data: summaries } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: ConvSummary[] | null; error: unknown }>)('dm_conversation_summaries', { _convs: convIds })

    const lastMsgMap: Record<string, { body: string; created_at: string }> = {}
    const unreadCountMap: Record<string, number> = {}
    for (const cid of convIds) unreadCountMap[cid] = 0
    for (const s of summaries ?? []) {
      if (s.last_created_at) lastMsgMap[s.conversation_id] = { body: s.last_body ?? '', created_at: s.last_created_at }
      unreadCountMap[s.conversation_id] = s.unread_count
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

// ── Inline-thread loaders for the chat dock ─────────────────────────────────
// The dock opens a conversation IN the pop-up (not a route change), so it needs the
// same data the thread pages load. Both are RLS-scoped on the user client, so a
// non-member gets null (the DB gate), never someone else's messages.

export type DockPeer = { id: string; display_name: string; handle: string; avatar_url: string | null }
export type DockDmMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string }
export type DockRoomMessage = {
  id: string; room_id: string; author_id: string; body: string; created_at: string; author: DockPeer | null
}

/** Load a 1:1/group DM for inline rendering in the dock (mirrors messages/[id]/page.tsx). */
export async function loadDockDmThread(conversationId: string): Promise<
  { myProfileId: string; participants: DockPeer[]; messages: DockDmMessage[]; title: string } | null
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: myProfile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!myProfile) return null
  const myProfileId = myProfile.id as string

  const [convRes, myPartRes, partRowsRes, peerRes, msgRes] = await Promise.all([
    supabase.from('conversations').select('id, name').eq('id', conversationId).maybeSingle(),
    supabase.from('conversation_participants').select('profile_id').eq('conversation_id', conversationId).eq('profile_id', myProfileId).maybeSingle(),
    supabase.from('conversation_participants').select('profile_id').eq('conversation_id', conversationId),
    (supabase).rpc('message_peer_profiles'),
    supabase.from('messages').select('id, conversation_id, sender_id, body, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(100),
  ])
  if (!convRes.data || !myPartRes.data) return null // am_participant gate

  const peerMap = new Map(((peerRes.data ?? []) as DockPeer[]).map((p) => [p.id, p]))
  const participants = ((partRowsRes.data ?? []) as { profile_id: string }[])
    .map((p) => peerMap.get(p.profile_id))
    .filter((p): p is DockPeer => !!p)
  const messages = ((msgRes.data ?? []) as unknown as DockDmMessage[]).reverse()
  const others = participants.filter((p) => p.id !== myProfileId)
  const title = (convRes.data.name as string | null)
    || (others.length > 1
      ? others.slice(0, 3).map((p) => p.display_name.split(' ')[0]).join(', ')
      : others[0]?.display_name ?? 'Conversation')

  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  return { myProfileId, participants, messages, title }
}

/** Load a room for inline rendering in the dock. RoomThread marks itself read on mount. */
export async function loadDockRoomThread(roomId: string): Promise<
  { myProfileId: string; messages: DockRoomMessage[]; canPost: boolean; name: string } | null
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: myProfile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!myProfile) return null
  const myProfileId = myProfile.id as string

  const [roomRes, memberRes, msgRes] = await Promise.all([
    supabase.from('rooms').select('id, name').eq('id', roomId).maybeSingle(),
    supabase.from('room_members').select('room_id').eq('room_id', roomId).eq('profile_id', myProfileId).maybeSingle(),
    supabase.from('room_messages').select('id, room_id, author_id, body, created_at').eq('room_id', roomId).order('created_at', { ascending: false }).limit(100),
  ])
  if (!roomRes.data) return null // am_room_member / open-read gate

  const raw = ((msgRes.data ?? []) as Array<Omit<DockRoomMessage, 'author'>>).reverse()
  const authorIds = Array.from(new Set(raw.map((m) => m.author_id)))
  const authorMap = new Map<string, DockPeer>()
  if (authorIds.length) {
    const { data: authors } = await supabase.from('profiles').select('id, display_name, handle, avatar_url').in('id', authorIds)
    for (const a of (authors ?? []) as DockPeer[]) authorMap.set(a.id, a)
  }
  const messages: DockRoomMessage[] = raw.map((m) => ({ ...m, author: authorMap.get(m.author_id) ?? null }))

  return { myProfileId, messages, canPost: !!memberRes.data, name: (roomRes.data.name as string) ?? 'Room' }
}
