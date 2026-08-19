import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { MessageSquare, Hash, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isOnline } from '@/lib/presence'
import { PresenceDot } from '@/components/presence/presence-dot'
import { getInitials, relativeTime } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { NewRoomCompose } from '@/components/compose/new-room-compose'
import { CrewLeadQuickAction } from '@/components/messages/crew-lead-quick-action'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import type { ProfileIdentity } from '@/lib/types/profile'
import { dmThreadHref } from '@/lib/messages/dm-destination'

type Profile = ProfileIdentity & {
  id: string
}

type ConversationRow = {
  id: string
  name: string | null
  created_at: string
  participants: Profile[]
  lastMessage: { body: string; sender_id: string; created_at: string } | null
  unreadCount: number
  myLastReadAt: string | null
}

type RoomRow = {
  id: string
  name: string
  description: string | null
  visibility: 'public' | 'private' | 'circle' | 'hub' | 'nexus' | 'outpost' | 'channel'
  member_count: number
  last_message_at: string | null
  isMember: boolean
}

type ThreadItem =
  | { kind: 'room'; id: string; lastActivity: string | null; sortName: string; unread: number; room: RoomRow }
  | { kind: 'dm'; id: string; lastActivity: string | null; sortName: string; unread: number; conv: ConversationRow }

// Room creation = paid (Crew/Supporter TIER) or a steward (host+). Crew is the
// paid tier, not a role (PB.1/ADR-207).
const STEWARD_ROLES = ['host', 'guide', 'mentor', 'admin', 'janitor']
const PAID_TIERS = ['crew', 'supporter']

type Filter = 'all' | 'rooms' | 'dms'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all',   label: 'All' },
  { value: 'rooms', label: 'Rooms' },
  { value: 'dms',   label: 'DMs' },
]

// The sort control (DAWN message-board pass): the thread list answers to the reader,
// not only to recency. Pure presentation — each option reorders the already-fetched
// list in JS; "Unread first" leans on the per-thread unread counts the page already
// loads for its badges.
type Sort = 'latest' | 'unread' | 'az'
const SORTS: { value: Sort; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'unread', label: 'Unread first' },
  { value: 'az',     label: 'A to Z' },
]

const ACTIVE_WINDOW_MS = 30 * 60 * 1000

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
function noteFailedRead(section: string, error: unknown): void {
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
// did not need a non-null `error` to do it. `createAdminClient()` asserts
// `process.env.SUPABASE_SERVICE_ROLE_KEY!` and @supabase/ssr throws "supabaseKey is required"
// when that env var is absent — SYNCHRONOUSLY, while the `Promise.all` argument list is still
// being built, so the throw escapes before a single sibling read is even started and every
// section of the inbox dies with it. Presence dots are decoration on this page; whether a peer
// was seen in the last thirty minutes may not decide whether a member can reach their
// conversations. Constructing the client inside the async boundary means a service-role
// misconfiguration costs the dots and logs why, instead of costing the page.
async function readPeerPresence(
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
const CONTENT_FALLBACK = {
  title: 'Messages',
  description: 'Every conversation in one place. Direct messages, and rooms (your private group chats and the open community Channels).',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/messages', CONTENT_FALLBACK)
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string }>
}) {
  const { filter: filterParam, sort: sortParam } = await searchParams
  const filter: Filter =
    filterParam === 'rooms' ? 'rooms' : filterParam === 'dms' ? 'dms' : 'all'
  const sort: Sort =
    sortParam === 'unread' ? 'unread' : sortParam === 'az' ? 'az' : 'latest'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  // RLS convergence surface 5 (migration 20260602195209): rooms + DMs read on the
  // user client (am_room_member / am_participant SELECT policies); the DM
  // participants' profiles, which RLS would otherwise hide from sub-crew/
  // cross-region viewers, come from the message_peer_profiles DEFINER RPC.
  const { data: myProfile, error: myProfileErr } = await supabase
    .from('profiles')
    .select('id, community_role, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // The redirect below cannot tell "this account has no profile yet" from "the profile read
  // failed", and it answers both with /onboarding — which sends a fully onboarded member back
  // through signup. The redirect stays (bouncing to onboarding is still the safer of the two
  // wrong answers), but the two causes are no longer indistinguishable in the logs.
  noteFailedRead('my profile', myProfileErr)
  if (!myProfile) redirect('/onboarding')
  const myProfileId = myProfile.id as string
  const canCreateRoom =
    PAID_TIERS.includes((myProfile as { membership_tier?: string | null }).membership_tier ?? '') ||
    STEWARD_ROLES.includes(myProfile.community_role ?? '')

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

  const nowMs = new Date().getTime()
  const activeItems = allItems.filter(it =>
    it.lastActivity && nowMs - new Date(it.lastActivity).getTime() < ACTIVE_WINDOW_MS
  )
  const activeIds = new Set(activeItems.map(it => `${it.kind}:${it.id}`))

  const filteredItems = allItems
    .filter(it => !activeIds.has(`${it.kind}:${it.id}`))
    .filter(it => filter === 'all' || (filter === 'rooms' ? it.kind === 'room' : it.kind === 'dm'))

  // The sort control, applied last. "Latest" keeps the activity order the list is
  // already in; the other two re-order in place (stable sort, so ties keep the
  // latest-activity order underneath).
  const sortedItems = [...filteredItems]
  if (sort === 'az') {
    sortedItems.sort((a, b) => a.sortName.localeCompare(b.sortName))
  } else if (sort === 'unread') {
    sortedItems.sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0))
  }

  // Room unread — the grouped room_unread_counts RPC (messages from others since my last_read_at, per
  // joined room, computed server-side) summed into the header badge, so it reflects rooms + DMs, not
  // DMs alone. Replaces the old per-room N+1 count loop.
  const roomUnread = [...roomUnreadMap.values()].reduce((sum, n) => sum + n, 0)

  const totalUnread =
    conversations.reduce((sum, c) => sum + c.unreadCount, 0) + roomUnread

  // Operator-editable page header (ADR-180), resolved in the second wave above. The unread badge
  // stays dynamic; only the static title + description flow through resolvePageContent.
  const { title: pageTitle, description: pageDescription, ctaLabel, ctaHref } = pageContent

  // Segmented filter + sort — both live in the "Your threads" section header, and
  // each preserves the other's choice in the link.
  const threadsHref = (f: Filter, s: Sort) => {
    const q = new URLSearchParams()
    if (f !== 'all') q.set('filter', f)
    if (s !== 'latest') q.set('sort', s)
    const qs = q.toString()
    return qs ? `/messages?${qs}` : '/messages'
  }

  const filterTabs = (
    <div className="flex items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
      {FILTERS.map(f => (
        <Link
          key={f.value}
          href={threadsHref(f.value, sort)}
          className={`rounded-md px-2.5 py-1 text-meta font-medium transition-colors ${
            filter === f.value ? 'bg-surface text-text lift-1' : 'text-muted hover:text-text'
          }`}
        >
          {f.label}
        </Link>
      ))}
    </div>
  )

  const sortTabs = (
    <div className="flex items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
      {SORTS.map(s => (
        <Link
          key={s.value}
          href={threadsHref(filter, s.value)}
          className={`rounded-md px-2.5 py-1 text-meta font-medium transition-colors ${
            sort === s.value ? 'bg-surface text-text lift-1' : 'text-muted hover:text-text'
          }`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  )

  return (
    <IndexTemplate
      title={
        <span className="flex items-center gap-2">
          {pageTitle}
          {totalUnread > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-primary px-1.5 text-meta font-bold text-on-primary">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </span>
      }
      description={pageDescription}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <CrewLeadQuickAction />
          {canCreateRoom && <NewRoomCompose />}
          {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
          {ctaLabel && ctaHref && (
            <a
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
            >
              {ctaLabel}
            </a>
          )}
        </div>
      }
    >
      <div className="space-y-8">
        {/* Active now */}
        {activeItems.length > 0 && (
          <section>
            <SectionHeader title="Active now" count={activeItems.length} />
            <div className="space-y-1">
              {activeItems.map(it =>
                it.kind === 'room'
                  ? <RoomRowItem key={`r-${it.id}`} room={it.room} />
                  : <DMRowItem key={`d-${it.id}`} conv={it.conv} myProfileId={myProfileId} onlineIds={onlineIds} />
              )}
            </div>
          </section>
        )}

        {/* Your threads */}
        <section>
          <SectionHeader
            title="Your threads"
            count={sortedItems.length > 0 ? sortedItems.length : undefined}
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {sortTabs}
                {filterTabs}
              </div>
            }
          />
          {sortedItems.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title={filter === 'rooms' ? 'No rooms joined yet' : filter === 'dms' ? 'No direct conversations yet' : 'No threads yet'}
              description={
                filter === 'rooms'
                  ? (canCreateRoom ? 'Create one above, or browse Discover below.' : 'Join one from Discover below.')
                  : filter === 'dms'
                    ? 'Start one from any member’s profile.'
                    : 'Join a room or start a DM to begin.'
              }
            />
          ) : (
            <div className="space-y-1">
              {sortedItems.map(it =>
                it.kind === 'room'
                  ? <RoomRowItem key={`r-${it.id}`} room={it.room} />
                  : <DMRowItem key={`d-${it.id}`} conv={it.conv} myProfileId={myProfileId} onlineIds={onlineIds} />
              )}
            </div>
          )}
        </section>

        {/* Channels — the open room for each channel you're tuned into */}
        {filter !== 'dms' && channelRooms.length > 0 && (
          <section>
            <SectionHeader title="Channels" count={channelRooms.length} />
            <div className="space-y-1">
              {channelRooms.map(room => (
                <Link
                  key={room.id}
                  href={`/messages/r/${room.id}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-elevated"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-signal-bg text-signal-strong">
                    <Hash className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-body-sm font-semibold text-text">{room.name}</span>
                      {room.last_message_at && (
                        <span className="shrink-0 text-meta text-subtle">{relativeTime(room.last_message_at)}</span>
                      )}
                    </div>
                    <p className="truncate text-meta text-subtle">Open channel room · anyone tuned in can post</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Discover — public rooms to join (hidden when filtered to DMs) */}
        {filter !== 'dms' && discoverRooms.length > 0 && (
          <section>
            <SectionHeader title="Discover rooms" count={discoverRooms.length} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {discoverRooms.map(room => (
                <EntityCard
                  key={room.id}
                  href={`/messages/r/${room.id}`}
                  anchor={
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
                      <Hash className="h-5 w-5" />
                    </span>
                  }
                  title={room.name}
                  context={
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3 shrink-0" />
                      {room.member_count} {room.member_count === 1 ? 'member' : 'members'}
                    </span>
                  }
                  description={room.description ?? undefined}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </IndexTemplate>
  )
}

function RoomRowItem({ room }: { room: RoomRow }) {
  return (
    <Link
      href={`/messages/r/${room.id}`}
      className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-surface-elevated transition-colors"
    >
      {/* Always the hash — a room never wears a padlock (GateNotice canon); privacy is
          said in words in the meta line instead. */}
      <div className="shrink-0 w-10 h-10 rounded-lg bg-primary-bg flex items-center justify-center">
        <Hash className="w-4 h-4 text-primary-strong" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-body-sm font-semibold text-text truncate">{room.name}</span>
          {room.last_message_at && (
            <span className="text-meta text-subtle shrink-0">{relativeTime(room.last_message_at)}</span>
          )}
        </div>
        <p className="text-meta text-subtle truncate">
          <Users className="w-3 h-3 inline mr-1 -mt-px" />
          {room.member_count} {room.member_count === 1 ? 'member' : 'members'}
          {room.visibility === 'private' && <> &middot; Private</>}
          {room.description && <> &middot; {room.description}</>}
        </p>
      </div>
    </Link>
  )
}

// THE LAST DM ENTRY POINT that hand-built the retiring URL (ADR-896 phase 2). Every server-side
// redirector already routes through `dmThreadHref`; this row did not, so with
// `chat_dm_routes_retired` ON, tapping a conversation in the inbox hit the retired route's gate and
// bounced the member onto /feed — off the very list they were reading. Async server component (this
// file has no 'use client'), and `chatDmRoutesRetiredFlag` is React-cached, so the whole render
// shares ONE round trip no matter how many rows ask. With the flag OFF this returns exactly the
// string that was hardcoded here, so today's behaviour is byte-identical.
async function DMRowItem({ conv, myProfileId, onlineIds }: { conv: ConversationRow; myProfileId: string; onlineIds: Set<string> }) {
  const hasUnread = conv.unreadCount > 0
  const isGroup = conv.participants.length > 1
  const peerOnline = !isGroup && !!conv.participants[0] && onlineIds.has(conv.participants[0].id)
  const display = conv.name || (isGroup
    ? conv.participants.slice(0, 3).map(p => p.display_name.split(' ')[0]).join(', ') +
      (conv.participants.length > 3 ? ` +${conv.participants.length - 3}` : '')
    : conv.participants[0]?.display_name ?? 'Unknown')
  // Opens the dock OVER the inbox once retired, so the member keeps their place in the list.
  const href = await dmThreadHref(conv.id, '/messages')

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-3 transition-colors ${
        hasUnread
          ? 'bg-primary-bg/70 hover:bg-primary-bg dark:hover:bg-primary-bg'
          : 'hover:bg-surface-elevated'
      }`}
    >
      <div className="shrink-0 relative">
        {isGroup ? (
          <GroupAvatars participants={conv.participants} />
        ) : conv.participants[0]?.avatar_url ? (
          <Image src={avatarSrc(conv.participants[0].avatar_url!)} alt={conv.participants[0].display_name} width={40} height={40} style={avatarFocusStyle(conv.participants[0].avatar_url)} className="w-10 h-10 rounded-pill object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-pill bg-primary-bg text-primary-strong text-body-sm font-semibold flex items-center justify-center select-none">
            {conv.participants[0] ? getInitials(conv.participants[0].display_name) : '?'}
          </div>
        )}
        <PresenceDot online={peerOnline} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-body-sm truncate ${hasUnread ? 'font-semibold text-text' : 'font-medium text-text'}`}>
            {display}
          </span>
          {conv.lastMessage && (
            <span className="text-meta text-subtle shrink-0">{relativeTime(conv.lastMessage.created_at)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className={`text-meta truncate flex-1 ${hasUnread ? 'text-text font-medium' : 'text-subtle'}`}>
            {conv.lastMessage
              ? conv.lastMessage.sender_id === myProfileId ? `You: ${conv.lastMessage.body}` : conv.lastMessage.body
              : 'No messages yet'}
          </p>
          {hasUnread && <span className="shrink-0 w-2 h-2 rounded-pill bg-primary" />}
        </div>
      </div>
    </Link>
  )
}

function GroupAvatars({ participants }: { participants: Profile[] }) {
  const shown = participants.slice(0, 3)
  return (
    <div className="relative w-10 h-10">
      {shown.map((p, i) => {
        const size = shown.length === 1 ? 'w-10 h-10' : shown.length === 2 ? 'w-7 h-7' : 'w-6 h-6'
        const pos = shown.length === 1
          ? ''
          : i === 0 ? 'absolute top-0 left-0' : i === 1 ? 'absolute bottom-0 right-0' : 'absolute bottom-0 left-0'
        return p.avatar_url ? (
          <Image key={p.id} src={avatarSrc(p.avatar_url)} alt={p.display_name} width={40} height={40}
            style={avatarFocusStyle(p.avatar_url)}
            className={`${size} ${pos} rounded-pill object-cover ring-2 ring-surface`} />
        ) : (
          <div key={p.id}
            className={`${size} ${pos} rounded-pill bg-primary-bg text-primary-strong text-meta font-semibold flex items-center justify-center ring-2 ring-surface`}>
            {getInitials(p.display_name)}
          </div>
        )
      })}
    </div>
  )
}
