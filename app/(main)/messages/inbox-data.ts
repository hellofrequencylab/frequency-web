import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isOnline } from '@/lib/presence'
import { resolvePageContent } from '@/lib/page-content'
import type { ProfileIdentity } from '@/lib/types/profile'

// The /messages inbox read, shared by the DAWN page and the Frequency Messages body
// (components/frequency/members/messages). Moved verbatim out of page.tsx: the two waves, the
// fail-safe log line per section, and the unified thread list. Filtering, sorting and rendering stay
// with each page.

export type Profile = ProfileIdentity & {
  id: string
}

export type ConversationRow = {
  id: string
  name: string | null
  created_at: string
  participants: Profile[]
  lastMessage: { body: string; sender_id: string; created_at: string } | null
  unreadCount: number
  myLastReadAt: string | null
}

export type RoomRow = {
  id: string
  name: string
  description: string | null
  visibility: 'public' | 'private' | 'circle' | 'hub' | 'nexus' | 'outpost' | 'channel'
  member_count: number
  last_message_at: string | null
  isMember: boolean
}

export type ThreadItem =
  | { kind: 'room'; id: string; lastActivity: string | null; sortName: string; unread: number; room: RoomRow }
  | { kind: 'dm'; id: string; lastActivity: string | null; sortName: string; unread: number; conv: ConversationRow }

// ── THE ELEVEN SWALLOWED READS ON THIS PAGE, AND THE ONE THAT COULD NOT BE SWALLOWED ─────────
// Every read below is FAIL-SAFE by intent: a denied or failed read should degrade ONE section
// of the inbox to empty, never take the whole surface to its error boundary. That is the same
// preference lib/platform-flags.ts states for flags ("a transient DB hiccup must never be able
// to make a member's messages unreachable"). The implementation only got half of it right.
//
// 🔴 WHAT WAS WRONG. Both `Promise.all` waves destructured `{ data }` and threw `{ error }` on
// the floor. A Supabase result with a non-null `error` carries `data: null`, so an RLS denial, a
// revoked EXECUTE grant on one of the three DEFINER RPCs, or a PostgREST 400 from a renamed
// column read to this page as the perfectly ordinary sentence "you have no rooms" / "you have no
// DMs" / "nobody is online". No throw, no log line, no signal of any kind — and AGENTS.md is
// explicit that a fail-safe with no gate watching it is an invisible regression. When the owner
// hit "Messages didn't load" on 2026-08-16 there was consequently nothing on this page's side of
// the request to read: it had eleven ways to fail quietly and none to say so.
//
// `noteFailedRead` is that missing gate. One tagged line per degraded section, on console.error,
// which is what Vercel's runtime errors and runtime logs group and count on — so the next
// occurrence names its own section instead of being reconstructed from the schema afterwards.
export function noteFailedRead(section: string, error: unknown): void {
  if (!error) return
  // No `error !== null` guard on the object branch, and CodeQL is the reason it went (alert 238,
  // "comparison between inconvertible types"). The usual reason to write one is that
  // `typeof null === 'object'` — but the truthiness return above has already narrowed `unknown` to
  // `{}`, so null cannot reach this line and the comparison could never be false. A check that can
  // only ever pass reads to the next person as though null were a live case here. It is not.
  const detail =
    typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  console.error(`[messages] ${section} read failed; that section degraded to empty:`, detail)
}

// The presence read is the ONE member of the second wave that could take the page down, and it
// did not need a non-null `error` to do it. `createAdminClient()` REQUIRES SUPABASE_SERVICE_ROLE_KEY
// and throws naming it (lib/supabase/env.ts; before LIVE-169 a bare non-null assertion let
// @supabase/ssr throw the unattributed "supabaseKey is required" instead) when that env var is absent — SYNCHRONOUSLY, while the `Promise.all` argument list is still
// being built, so the throw escapes before a single sibling read is even started and every
// section of the inbox dies with it. Presence dots are decoration on this page; whether a peer
// was seen in the last thirty minutes may not decide whether a member can reach their
// conversations. Constructing the client inside the async boundary means a service-role
// misconfiguration costs the dots and logs why, instead of costing the page.
export async function readPeerPresence(
  peerIds: string[],
): Promise<{ id: string; last_seen_at: string | null }[]> {
  if (peerIds.length === 0) return []
  try {
    const { data, error } = await createAdminClient()
      .from('profiles')
      .select('id, last_seen_at')
      .in('id', peerIds)
    noteFailedRead('peer presence', error)
    return (data ?? []) as { id: string; last_seen_at: string | null }[]
  } catch (e) {
    noteFailedRead('peer presence (admin client)', e)
    return []
  }
}

// Coded defaults for the operator-editable content (ADR-180) — shared by the
// page header and the SEO metadata below.
// Coded defaults for the operator-editable content (ADR-180) — shared by the
// page header and the SEO metadata below.
export const CONTENT_FALLBACK = {
  title: 'Messages',
  description: 'Every conversation in one place. Direct messages, and rooms (your private group chats and the open community Channels).',
}


export interface Inbox {
  allItems: ThreadItem[]
  channelRooms: RoomRow[]
  discoverRooms: RoomRow[]
  totalUnread: number
  onlineIds: Set<string>
  pageContent: Awaited<ReturnType<typeof resolvePageContent>>
}

export async function loadInbox(
  supabase: Awaited<ReturnType<typeof createClient>>,
  myProfileId: string,
): Promise<Inbox> {
  // First wave: five mutually-independent reads (each depends only on myProfileId or nothing) run
  // concurrently instead of serially. Their dependent follow-ups (presence, my rooms, channel rooms,
  // co-participants) resolve after, off these results. No ordering matters — the discover-rooms and
  // co-participant filters already exclude joined/self in JS.
  const [peerRes, myMembershipsRes, publicRoomsRes, myTunedRes, myPartsRawRes] = await Promise.all([
    (supabase).rpc('message_peer_profiles'),
    supabase.from('room_members').select('room_id, last_read_at').eq('profile_id', myProfileId),
    supabase
      .from('rooms')
      .select('id, name, description, visibility, member_count, last_message_at')
      .eq('visibility', 'public')
      .order('member_count', { ascending: false })
      .limit(10),
    (supabase).from('topical_channel_memberships').select('topical_channel_id').eq('profile_id', myProfileId),
    (supabase)
      .from('conversation_participants')
      .select('conversation_id, last_read_at, conversations!conversation_id(id, name, created_at, migrated_to_room_id)')
      .eq('profile_id', myProfileId),
  ])

  // Public profile fields for everyone I share a DM / room with (caller-scoped). This one read
  // failing is the loudest degradation on the page: with no peer map EVERY 1:1 row falls back to
  // "Unknown" with a placeholder initial, which looks like data loss rather than a failed read.
  const { data: peerRows, error: peerErr } = peerRes
  noteFailedRead('peer profiles (message_peer_profiles)', peerErr)
  const peerMap = new Map(((peerRows ?? []) as Profile[]).map(p => [p.id, p]))

  const peerIds = [...peerMap.keys()]

  // ── Second-wave input id-lists, computed synchronously from the first wave ─────
  // A failed membership read empties joinedRoomIds, which silently cascades: no "Your threads"
  // rooms, no room unread counts, and every room the member HAS joined reappears under Discover
  // as if they had never joined it. Worth a line of its own for that reason.
  const { data: myMemberships, error: myMembershipsErr } = myMembershipsRes
  noteFailedRead('room memberships', myMembershipsErr)
  const joinedRoomIds = (myMemberships ?? []).map((m: { room_id: string }) => m.room_id)

  const { data: myTuned, error: myTunedErr } = myTunedRes
  noteFailedRead('tuned channels', myTunedErr)
  const tunedChannelIds = ((myTuned ?? []) as { topical_channel_id: string }[]).map(c => c.topical_channel_id)

  // Migrated group threads now live as private rooms; filter them out so they don't double-show
  // (conversation copy + room copy). `migrated_to_room_id` isn't in the generated types yet.
  // The DM list itself. This read carries a PostgREST embed hint
  // (`conversations!conversation_id(...)`), so it is the one query on the page that can 400 on a
  // schema change alone — a renamed FK or a dropped `migrated_to_room_id` would empty a member's
  // entire DM list while the page still rendered a cheerful "No threads yet".
  const { data: myPartsRaw, error: myPartsErr } = myPartsRawRes
  noteFailedRead('my conversations', myPartsErr)
  const myParts = ((myPartsRaw ?? []) as unknown as Array<{
    conversation_id: string
    last_read_at: string | null
    conversations: { id: string; name: string | null; created_at: string; migrated_to_room_id: string | null } | null
  }>).filter((p) => !p.conversations?.migrated_to_room_id)
  const convIds = (myParts ?? []).map(p => p.conversation_id as string)
  const myLastReadMap: Record<string, string | null> = {}
  const convNameMap: Record<string, string | null> = {}
  for (const p of myParts ?? []) {
    const cid = p.conversation_id as string
    myLastReadMap[cid] = p.last_read_at as string | null
    const conv = (p as unknown as { conversations: { name: string | null } | null }).conversations
    convNameMap[cid] = conv?.name ?? null
  }

  // ── Second wave: every follow-up read consumes ONLY first-wave output, so they are mutually
  // independent — fire them CONCURRENTLY in ONE Promise.all instead of ~6 serial round-trips on this
  // hot surface. Presence uses the admin client (last_seen_at is public; shows regardless of region).
  // Room unread folds the old per-room N+1 into one grouped RPC (room_unread_counts). An empty
  // id-list short-circuits to an empty result (no query). Untyped rpc handle (ADR-246). ─────────────
  const roomCols = 'id, name, description, visibility, member_count, last_message_at'
  type ConvSummary = {
    conversation_id: string
    last_id: string | null
    last_body: string | null
    last_sender: string | null
    last_created_at: string | null
    unread_count: number
  }
  type RoomUnread = { room_id: string; unread_count: number }
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>

  const [onlineRows, myRoomsRes, channelRoomsRes, allPartsRes, summariesRes, roomUnreadRes, pageContent] =
    await Promise.all([
      readPeerPresence(peerIds),
      joinedRoomIds.length > 0
        ? supabase.from('rooms').select(roomCols).in('id', joinedRoomIds)
            .order('last_message_at', { ascending: false, nullsFirst: false })
        : Promise.resolve({ data: [], error: null }),
      tunedChannelIds.length > 0
        ? (supabase).from('rooms').select(roomCols).eq('visibility', 'channel')
            .in('scope_id', tunedChannelIds)
            .order('last_message_at', { ascending: false, nullsFirst: false })
        : Promise.resolve({ data: [], error: null }),
      convIds.length > 0
        ? supabase.from('conversation_participants').select('conversation_id, profile_id')
            .in('conversation_id', convIds).neq('profile_id', myProfileId)
        : Promise.resolve({ data: [], error: null }),
      convIds.length > 0
        ? (rpc('dm_conversation_summaries', { _convs: convIds }) as Promise<{ data: ConvSummary[] | null; error: unknown }>)
        : Promise.resolve({ data: [] as ConvSummary[], error: null }),
      joinedRoomIds.length > 0
        ? (rpc('room_unread_counts', { _rooms: joinedRoomIds }) as Promise<{ data: RoomUnread[] | null; error: unknown }>)
        : Promise.resolve({ data: [] as RoomUnread[], error: null }),
      resolvePageContent('/messages', CONTENT_FALLBACK),
    ])

  // Liveness (Phase D): who among my DM peers is active now (last_seen_at is public). Already
  // error-checked and degraded inside readPeerPresence, so this is a plain array by here.
  const onlineIds = new Set(onlineRows.filter(s => isOnline(s.last_seen_at)).map(s => s.id))

  // ── Rooms ─────────────────────────────────────────────────────────
  noteFailedRead('my rooms', myRoomsRes.error)
  const myRooms: RoomRow[] = ((myRoomsRes.data ?? []) as Omit<RoomRow, 'isMember'>[])
    .map(r => ({ ...r, isMember: true }))

  // Discover: public rooms not yet joined (fetched in the first wave above).
  const { data: publicRoomsData, error: publicRoomsErr } = publicRoomsRes
  noteFailedRead('discover rooms', publicRoomsErr)
  const discoverRooms: RoomRow[] = ((publicRoomsData ?? []) as Omit<RoomRow, 'isMember'>[])
    .filter(r => !joinedRoomIds.includes(r.id))
    .map(r => ({ ...r, isMember: false }))

  // Channel open rooms for the channels I'm tuned into (Phase B). Untyped client (scope_id not typed).
  noteFailedRead('channel rooms', channelRoomsRes.error)
  const channelRooms: RoomRow[] = ((channelRoomsRes.data ?? []) as unknown as Omit<RoomRow, 'isMember'>[])
    .map(r => ({ ...r, isMember: false }))

  // ── DMs (1:1 only — Phase B) ──────────────────────────────────────
  noteFailedRead('conversation participants', allPartsRes.error)
  const otherPartMap: Record<string, Profile[]> = {}
  for (const p of (allPartsRes.data ?? []) as { conversation_id: string; profile_id: string }[]) {
    const cid = p.conversation_id
    const prof = peerMap.get(p.profile_id)
    if (!prof) continue
    if (!otherPartMap[cid]) otherPartMap[cid] = []
    otherPartMap[cid].push(prof)
  }

  // Per-conversation newest message + the caller's unread count from the window RPC (no shared-budget
  // starvation). Fail-safe: empty on error — which reads as every conversation showing "No
  // messages yet" with a zero badge, so it needs the log line more than most.
  noteFailedRead('DM summaries (dm_conversation_summaries)', summariesRes.error)
  const summaryByConv: Record<string, ConvSummary> = {}
  for (const s of (summariesRes.data ?? []) as ConvSummary[]) summaryByConv[s.conversation_id] = s

  const conversations: ConversationRow[] = (myParts ?? [])
    .map(part => {
      const cid = part.conversation_id as string
      const s = summaryByConv[cid]
      const conv = (part as unknown as { conversations: { id: string; created_at: string } | null }).conversations

      return {
        id: cid,
        name: convNameMap[cid] ?? null,
        created_at: conv?.created_at ?? '',
        participants: otherPartMap[cid] ?? [],
        lastMessage: s?.last_id
          ? { body: s.last_body ?? '', sender_id: s.last_sender ?? '', created_at: s.last_created_at ?? '' }
          : null,
        unreadCount: s?.unread_count ?? 0,
        myLastReadAt: myLastReadMap[cid] ?? null,
      }
    })
    .sort((a, b) => {
      const aTime = a.lastMessage?.created_at ?? a.created_at
      const bTime = b.lastMessage?.created_at ?? b.created_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

  // Per-room unread map — feeds both the header badge total and the "Unread first"
  // sort, from the one grouped RPC read.
  noteFailedRead('room unread counts (room_unread_counts)', roomUnreadRes.error)
  const roomUnreadMap = new Map(
    ((roomUnreadRes.data ?? []) as RoomUnread[]).map(r => [r.room_id, Number(r.unread_count)]),
  )

  // ── Unified thread list ───────────────────────────────────────────
  const roomItems: ThreadItem[] = myRooms.map(r => ({
    kind: 'room' as const,
    id: r.id,
    lastActivity: r.last_message_at,
    sortName: r.name,
    unread: roomUnreadMap.get(r.id) ?? 0,
    room: r,
  }))
  const dmItems: ThreadItem[] = conversations.map(c => ({
    kind: 'dm' as const,
    id: c.id,
    lastActivity: c.lastMessage?.created_at ?? c.created_at,
    sortName: c.name || (c.participants[0]?.display_name ?? ''),
    unread: c.unreadCount,
    conv: c,
  }))

  const allItems: ThreadItem[] = [...roomItems, ...dmItems].sort((a, b) => {
    const at = a.lastActivity ? new Date(a.lastActivity).getTime() : 0
    const bt = b.lastActivity ? new Date(b.lastActivity).getTime() : 0
    return bt - at
  })

  // Room unread — the grouped room_unread_counts RPC (messages from others since my last_read_at, per
  // joined room, computed server-side) summed into the header badge, so it reflects rooms + DMs, not
  // DMs alone. Replaces the old per-room N+1 count loop.
  const roomUnread = [...roomUnreadMap.values()].reduce((sum, n) => sum + n, 0)

  const totalUnread =
    conversations.reduce((sum, c) => sum + c.unreadCount, 0) + roomUnread

  return { allItems, channelRooms, discoverRooms, totalUnread, onlineIds, pageContent }
}
