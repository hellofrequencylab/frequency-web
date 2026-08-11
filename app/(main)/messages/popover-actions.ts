'use server'

import { createClient } from '@/lib/supabase/server'
import { dmTitle } from '@/lib/messages/dm-title'
import { canPostToRoom, type RoomVisibility } from '@/lib/messages/room-access'

export interface MessagesSummary {
  totalUnread: number
  rooms: Array<{
    id: string
    name: string
    // 'channel' was missing from this union while the inbox reads rooms with
    // `.eq('visibility', 'channel')` (messages/page.tsx), so a channel room flowed through the
    // dock mis-typed and its label rendered from a value the type said could not exist.
    visibility: 'public' | 'private' | 'circle' | 'hub' | 'nexus' | 'outpost' | 'channel'
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
  //
  // ⏱️ THIS FUNCTION USED TO BE NINE SEQUENTIAL ROUND TRIPS and it is the dock's whole
  // time-to-first-paint: DockChat holds a spinner until the summary resolves, so every hop is
  // felt on a refresh (the module cache is empty then by construction). They were serial by
  // habit, not by dependency — most of them need nothing from the one before.
  //
  // The real graph, and what it now runs as:
  //
  //   1. auth.getUser()
  //   2. profiles ‖ message_peer_profiles        (the RPC keys off the SESSION, not myProfileId)
  //   3. room_members ‖ conversation_participants (both keyed on myProfileId, nothing shared)
  //   4. [rooms ‖ room_unread_counts] ‖ [other participants ‖ dm_conversation_summaries]
  //
  // Nine hops became four levels. Every await below that is NOT inside a Promise.all is there
  // because the next read genuinely needs its result.
  const [profileRes, peerRes] = await Promise.all([
    supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle(),
    (supabase).rpc('message_peer_profiles'),
  ])
  const myProfile = profileRes.data
  if (!myProfile) return { totalUnread: 0, rooms: [], conversations: [] }

  const myProfileId = myProfile.id as string

  const peerMap = new Map(
    ((peerRes.data ?? []) as { id: string; display_name: string; handle: string; avatar_url: string | null }[])
      .map(p => [p.id, p]),
  )

  // ── Level 3: the two membership reads, in parallel ─────────────────
  // room_members and conversation_participants are both keyed on myProfileId and share nothing
  // else, so the rooms half and the DMs half of this summary are two independent chains from
  // here down. They used to run end to end, one after the other.
  const [roomMembershipRes, myPartsRes] = await Promise.all([
    supabase.from('room_members').select('room_id, last_read_at').eq('profile_id', myProfileId),
    (supabase)
      .from('conversation_participants')
      .select('conversation_id, last_read_at, conversations!conversation_id(id, name, migrated_to_room_id)')
      .eq('profile_id', myProfileId),
  ])

  // ── Rooms (top 5 by recent activity) ───────────────────────────────
  const myRoomMemberships = roomMembershipRes.data
  const roomIds = (myRoomMemberships ?? []).map(m => m.room_id as string)

  let rooms: MessagesSummary['rooms'] = []
  if (roomIds.length > 0) {
    // The unread counts fire ALONGSIDE the rooms read rather than after it. That costs the DB a
    // few extra counts (all of the caller's rooms instead of just their five most recent) and
    // saves a full round trip; the RPC is already scoped to the caller's own memberships via
    // auth.uid(), so widening the id list cannot widen what it can see. Only the five that
    // survive the `.limit(5)` below are ever read out of the map.
    const rpcAll = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>
    const [roomsRes, unreadRes] = await Promise.all([
      supabase
        .from('rooms')
        .select('id, name, visibility, last_message_at')
        .in('id', roomIds)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(5),
      rpcAll('room_unread_counts', { _rooms: roomIds }) as Promise<{
        data: Array<{ room_id: string; unread_count: number }> | null
      }>,
    ])

    const roomList = (roomsRes.data ?? []) as Array<{ id: string; name: string; visibility: MessagesSummary['rooms'][number]['visibility']; last_message_at: string | null }>

    // Unread per room in ONE grouped read. This used to be an N+1: a `count(*)` query per room,
    // fired on every dock open AND warmed on every page mount by prefetchDockSummary, so the
    // dock cost more round-trips than the whole inbox page it summarises. The inbox itself
    // already folds this into room_unread_counts (migration 20261012000000, scoped to the
    // caller's own memberships via auth.uid()); the dock now uses the same RPC.
    // FAIL-SAFE: an RPC error yields 0 unread, never a broken dock.
    const unreadMap = new Map((unreadRes.data ?? []).map(r => [r.room_id, Number(r.unread_count) || 0]))

    rooms = roomList.map(r => ({ ...r, unread: unreadMap.get(r.id) ?? 0 }))
  }

  // ── DMs (top 5 by recent activity) — 1:1 only (Phase B) ────────────
  // Exclude migrated group threads (they live as private rooms now).
  const myPartsRaw = myPartsRes.data
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
    // The peer list and the per-conversation summaries are independent reads over the same
    // convIds, so they go together rather than one after the other.
    type ConvSummaryRow = {
      conversation_id: string
      last_body: string | null
      last_created_at: string | null
      unread_count: number
    }
    const [othersRes, summariesRes] = await Promise.all([
      supabase
        .from('conversation_participants')
        .select('conversation_id, profile_id')
        .in('conversation_id', convIds)
        .neq('profile_id', myProfileId),
      (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: ConvSummaryRow[] | null; error: unknown }>)('dm_conversation_summaries', { _convs: convIds }),
    ])
    const others = othersRes.data

    const partsByConv: Record<string, MessagesSummary['conversations'][number]['participants']> = {}
    for (const o of others ?? []) {
      const cid = o.conversation_id as string
      const prof = peerMap.get(o.profile_id as string)
      if (!prof) continue
      if (!partsByConv[cid]) partsByConv[cid] = []
      partsByConv[cid].push(prof)
    }

    // Per-conversation newest message + unread count via the window RPC (no shared-budget
    // starvation across busy threads; matches the inbox). Fetched above, beside the peer read.
    const summaries = summariesRes.data

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

/** Load a 1:1/group DM for inline rendering in the dock (mirrors messages/[id]/page.tsx).
 *
 *  `name` is the RAW `conversations.name` and `title` is the DERIVED display string. The dock's
 *  rename field must prefill from `name`: prefilling from `title` would put the derived label
 *  ("Aisha, Ben") in the input, and one Save would silently promote a label that never existed
 *  in the database into a stored name nobody chose. The page has always had both (it passes
 *  `conv.name` to ConversationRenameButton while rendering `displayName`); the dock only ever
 *  received the collapsed one. */
export async function loadDockDmThread(conversationId: string): Promise<
  { myProfileId: string; participants: DockPeer[]; messages: DockDmMessage[]; title: string; name: string | null } | null
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
  const name = (convRes.data.name as string | null) ?? null
  // Shared rule (lib/messages/dm-title.ts), not a third hand-rolled copy. The dock can now
  // clear a conversation's name, and the client has to fall back to the same derived label the
  // server would produce. This inlined version had already drifted from the page's: it dropped
  // the `+N` overflow, so a six-person thread read differently in the two renderers.
  const title = dmTitle(name, participants, myProfileId)

  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  return { myProfileId, participants, messages, title, name }
}

/** Load a room for inline rendering in the dock. RoomThread marks itself read on mount.
 *
 *  `canPost` used to be `!!memberRes.data` — a `room_members` row. That is the wrong question
 *  for a Channel room, which carries no room_members rows at all (you tune into the Channel),
 *  so every Channel room in the dock was read-only for everybody including the people entitled
 *  to post. It now runs the same rule the page and `sendRoomMessage` run
 *  (lib/messages/room-access.ts), and `visibility` travels with it so the composer's gate
 *  sentence can name the right door. */
export async function loadDockRoomThread(roomId: string): Promise<
  {
    myProfileId: string
    messages: DockRoomMessage[]
    canPost: boolean
    name: string
    visibility: RoomVisibility
  } | null
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: myProfile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!myProfile) return null
  const myProfileId = myProfile.id as string

  const [roomRes, memberRes, msgRes] = await Promise.all([
    // visibility + scope_id, because the post gate below asks a Channel room a different
    // question from every other kind, and the tune-in row is keyed on scope_id.
    supabase.from('rooms').select('id, name, visibility, scope_id').eq('id', roomId).maybeSingle(),
    supabase.from('room_members').select('room_id').eq('room_id', roomId).eq('profile_id', myProfileId).maybeSingle(),
    supabase.from('room_messages').select('id, room_id, author_id, body, created_at').eq('room_id', roomId).order('created_at', { ascending: false }).limit(100),
  ])
  if (!roomRes.data) return null // am_room_member / open-read gate

  const visibility = ((roomRes.data.visibility as string) ?? 'public') as RoomVisibility
  const scopeId = (roomRes.data.scope_id as string | null) ?? null

  // Tune-in, read only when it can matter. `tcm: read own` scopes it to the caller's own row
  // on the user client, so this adds no round trip for the rooms where it is irrelevant.
  let isTunedIn = false
  if (visibility === 'channel' && scopeId) {
    const { data: tuned } = await supabase
      .from('topical_channel_memberships')
      .select('profile_id')
      .eq('topical_channel_id', scopeId)
      .eq('profile_id', myProfileId)
      .maybeSingle()
    isTunedIn = !!tuned
  }

  const raw = ((msgRes.data ?? []) as Array<Omit<DockRoomMessage, 'author'>>).reverse()
  const authorIds = Array.from(new Set(raw.map((m) => m.author_id)))
  const authorMap = new Map<string, DockPeer>()
  if (authorIds.length) {
    const { data: authors } = await supabase.from('profiles').select('id, display_name, handle, avatar_url').in('id', authorIds)
    for (const a of (authors ?? []) as DockPeer[]) authorMap.set(a.id, a)
  }
  const messages: DockRoomMessage[] = raw.map((m) => ({ ...m, author: authorMap.get(m.author_id) ?? null }))

  return {
    myProfileId,
    messages,
    canPost: canPostToRoom({ visibility, isMember: !!memberRes.data, isTunedIn }),
    name: (roomRes.data.name as string) ?? 'Room',
    visibility,
  }
}
