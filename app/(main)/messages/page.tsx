import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { MessageSquare, Hash, Lock, Users } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getInitials, relativeTime } from '@/lib/utils'
import { NewRoomCompose } from '@/components/compose/new-room-compose'
import { NewGroupDMCompose } from '@/components/compose/new-group-dm-compose'
import { CrewLeadQuickAction } from '@/components/messages/crew-lead-quick-action'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import type { ProfileIdentity } from '@/lib/types/profile'

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
  visibility: 'public' | 'private' | 'circle' | 'hub' | 'nexus' | 'outpost'
  member_count: number
  last_message_at: string | null
  isMember: boolean
}

type ThreadItem =
  | { kind: 'room'; id: string; lastActivity: string | null; room: RoomRow }
  | { kind: 'dm'; id: string; lastActivity: string | null; conv: ConversationRow }

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'
const CREW_PLUS: CommunityRole[] = ['crew', 'host', 'guide', 'mentor', 'janitor']

type Filter = 'all' | 'rooms' | 'dms'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all',   label: 'All' },
  { value: 'rooms', label: 'Rooms' },
  { value: 'dms',   label: 'DMs' },
]

const ACTIVE_WINDOW_MS = 30 * 60 * 1000

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter: filterParam } = await searchParams
  const filter: Filter =
    filterParam === 'rooms' ? 'rooms' : filterParam === 'dms' ? 'dms' : 'all'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  // RLS convergence surface 5 (migration 20260602195209): rooms + DMs read on the
  // user client (am_room_member / am_participant SELECT policies); the DM
  // participants' profiles, which RLS would otherwise hide from sub-crew/
  // cross-region viewers, come from the message_peer_profiles DEFINER RPC.
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!myProfile) redirect('/onboarding')
  const myProfileId = myProfile.id as string
  const canCreateRoom = CREW_PLUS.includes(myProfile.community_role as CommunityRole)

  // Public profile fields for everyone I share a DM / room with (caller-scoped).
  const { data: peerRows } = await (supabase as unknown as SupabaseClient).rpc('message_peer_profiles')
  const peerMap = new Map(((peerRows ?? []) as Profile[]).map(p => [p.id, p]))

  // ── Rooms ─────────────────────────────────────────────────────────
  const { data: myMemberships } = await supabase
    .from('room_members')
    .select('room_id, last_read_at')
    .eq('profile_id', myProfileId)

  const joinedRoomIds = (myMemberships ?? []).map((m: { room_id: string }) => m.room_id)

  const { data: myRoomsData } = joinedRoomIds.length > 0
    ? await supabase
        .from('rooms')
        .select('id, name, description, visibility, member_count, last_message_at')
        .in('id', joinedRoomIds)
        .order('last_message_at', { ascending: false, nullsFirst: false })
    : { data: [] }

  const myRooms: RoomRow[] = ((myRoomsData ?? []) as Omit<RoomRow, 'isMember'>[])
    .map(r => ({ ...r, isMember: true }))

  // Discover: public rooms not yet joined
  const { data: publicRoomsData } = await supabase
    .from('rooms')
    .select('id, name, description, visibility, member_count, last_message_at')
    .eq('visibility', 'public')
    .order('member_count', { ascending: false })
    .limit(10)

  const discoverRooms: RoomRow[] = ((publicRoomsData ?? []) as Omit<RoomRow, 'isMember'>[])
    .filter(r => !joinedRoomIds.includes(r.id))
    .map(r => ({ ...r, isMember: false }))

  // ── DMs ───────────────────────────────────────────────────────────
  const { data: myParts } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at, conversations!conversation_id(id, name, created_at)')
    .eq('profile_id', myProfileId)

  const convIds = (myParts ?? []).map(p => p.conversation_id as string)
  const myLastReadMap: Record<string, string | null> = {}
  const convNameMap: Record<string, string | null> = {}
  for (const p of myParts ?? []) {
    const cid = p.conversation_id as string
    myLastReadMap[cid] = p.last_read_at as string | null
    const conv = (p as unknown as { conversations: { name: string | null } | null }).conversations
    convNameMap[cid] = conv?.name ?? null
  }

  const otherPartMap: Record<string, Profile[]> = {}
  if (convIds.length > 0) {
    const { data: allParts } = await supabase
      .from('conversation_participants')
      .select('conversation_id, profile_id')
      .in('conversation_id', convIds)
      .neq('profile_id', myProfileId)
    for (const p of allParts ?? []) {
      const cid = p.conversation_id as string
      const prof = peerMap.get(p.profile_id as string)
      if (!prof) continue
      if (!otherPartMap[cid]) otherPartMap[cid] = []
      otherPartMap[cid].push(prof)
    }
  }

  const messagesByConv: Record<string, Array<{ id: string; conversation_id: string; sender_id: string; body: string; created_at: string }>> = {}
  if (convIds.length > 0) {
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(convIds.length * 20)

    for (const msg of recentMessages ?? []) {
      const cid = msg.conversation_id as string
      if (!messagesByConv[cid]) messagesByConv[cid] = []
      messagesByConv[cid].push(msg as { id: string; conversation_id: string; sender_id: string; body: string; created_at: string })
    }
  }

  const conversations: ConversationRow[] = (myParts ?? [])
    .map(part => {
      const cid = part.conversation_id as string
      const msgs = messagesByConv[cid] ?? []
      const lastMsg = msgs[0] ?? null
      const myLastRead = myLastReadMap[cid]
      const unreadCount = myLastRead
        ? msgs.filter(m => m.sender_id !== myProfileId && new Date(m.created_at) > new Date(myLastRead)).length
        : msgs.filter(m => m.sender_id !== myProfileId).length
      const conv = (part as unknown as { conversations: { id: string; created_at: string } | null }).conversations

      return {
        id: cid,
        name: convNameMap[cid] ?? null,
        created_at: conv?.created_at ?? '',
        participants: otherPartMap[cid] ?? [],
        lastMessage: lastMsg ? { body: lastMsg.body, sender_id: lastMsg.sender_id, created_at: lastMsg.created_at } : null,
        unreadCount,
        myLastReadAt: myLastRead ?? null,
      }
    })
    .sort((a, b) => {
      const aTime = a.lastMessage?.created_at ?? a.created_at
      const bTime = b.lastMessage?.created_at ?? b.created_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

  // ── Unified thread list ───────────────────────────────────────────
  const roomItems: ThreadItem[] = myRooms.map(r => ({
    kind: 'room' as const,
    id: r.id,
    lastActivity: r.last_message_at,
    room: r,
  }))
  const dmItems: ThreadItem[] = conversations.map(c => ({
    kind: 'dm' as const,
    id: c.id,
    lastActivity: c.lastMessage?.created_at ?? c.created_at,
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

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  // Segmented filter — lives in the "Your threads" section header.
  const filterTabs = (
    <div className="flex items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
      {FILTERS.map(f => (
        <Link
          key={f.value}
          href={f.value === 'all' ? '/messages' : `/messages?filter=${f.value}`}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            filter === f.value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
          }`}
        >
          {f.label}
        </Link>
      ))}
    </div>
  )

  return (
    <IndexTemplate
      title={
        <span className="flex items-center gap-2">
          Messages
          {totalUnread > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-on-primary">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </span>
      }
      description="Every conversation in one place. Direct messages, group threads, and rooms with the wider community."
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <CrewLeadQuickAction />
          <NewGroupDMCompose />
          {canCreateRoom && <NewRoomCompose />}
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
                  : <DMRowItem key={`d-${it.id}`} conv={it.conv} myProfileId={myProfileId} />
              )}
            </div>
          </section>
        )}

        {/* Your threads */}
        <section>
          <SectionHeader
            title="Your threads"
            count={filteredItems.length > 0 ? filteredItems.length : undefined}
            action={filterTabs}
          />
          {filteredItems.length === 0 ? (
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
              {filteredItems.map(it =>
                it.kind === 'room'
                  ? <RoomRowItem key={`r-${it.id}`} room={it.room} />
                  : <DMRowItem key={`d-${it.id}`} conv={it.conv} myProfileId={myProfileId} />
              )}
            </div>
          )}
        </section>

        {/* Discover — public rooms to join (hidden when filtered to DMs) */}
        {filter !== 'dms' && discoverRooms.length > 0 && (
          <section>
            <SectionHeader title="Discover rooms" count={discoverRooms.length} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {discoverRooms.map(room => (
                <Link
                  key={room.id}
                  href={`/messages/r/${room.id}`}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary-bg hover:shadow-md"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
                    <Hash className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold leading-tight text-text">{room.name}</p>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-subtle">
                      <Users className="h-3 w-3 shrink-0" />
                      {room.member_count} {room.member_count === 1 ? 'member' : 'members'}
                      {room.description && <> &middot; {room.description}</>}
                    </p>
                  </div>
                </Link>
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
      <div className="shrink-0 w-10 h-10 rounded-lg bg-primary-bg flex items-center justify-center">
        {room.visibility === 'private'
          ? <Lock className="w-4 h-4 text-primary-strong" />
          : <Hash className="w-4 h-4 text-primary-strong" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text truncate">{room.name}</span>
          {room.last_message_at && (
            <span className="text-xs text-subtle shrink-0">{relativeTime(room.last_message_at)}</span>
          )}
        </div>
        <p className="text-xs text-subtle truncate">
          <Users className="w-3 h-3 inline mr-1 -mt-px" />
          {room.member_count} {room.member_count === 1 ? 'member' : 'members'}
          {room.description && <> &middot; {room.description}</>}
        </p>
      </div>
    </Link>
  )
}

function DMRowItem({ conv, myProfileId }: { conv: ConversationRow; myProfileId: string }) {
  const hasUnread = conv.unreadCount > 0
  const isGroup = conv.participants.length > 1
  const display = conv.name || (isGroup
    ? conv.participants.slice(0, 3).map(p => p.display_name.split(' ')[0]).join(', ') +
      (conv.participants.length > 3 ? ` +${conv.participants.length - 3}` : '')
    : conv.participants[0]?.display_name ?? 'Unknown')

  return (
    <Link
      href={`/messages/${conv.id}`}
      className={`flex items-center gap-3 rounded-lg px-3 py-3 transition-colors ${
        hasUnread
          ? 'bg-primary-bg/70 hover:bg-primary-bg dark:hover:bg-primary-bg'
          : 'hover:bg-surface-elevated'
      }`}
    >
      <div className="shrink-0">
        {isGroup ? (
          <GroupAvatars participants={conv.participants} />
        ) : conv.participants[0]?.avatar_url ? (
          <Image src={conv.participants[0].avatar_url!} alt={conv.participants[0].display_name} width={40} height={40} className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary-bg text-primary-strong text-sm font-semibold flex items-center justify-center select-none">
            {conv.participants[0] ? getInitials(conv.participants[0].display_name) : '?'}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${hasUnread ? 'font-semibold text-text' : 'font-medium text-text'}`}>
            {display}
          </span>
          {conv.lastMessage && (
            <span className="text-xs text-subtle shrink-0">{relativeTime(conv.lastMessage.created_at)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className={`text-xs truncate flex-1 ${hasUnread ? 'text-text font-medium' : 'text-subtle'}`}>
            {conv.lastMessage
              ? conv.lastMessage.sender_id === myProfileId ? `You: ${conv.lastMessage.body}` : conv.lastMessage.body
              : 'No messages yet'}
          </p>
          {hasUnread && <span className="shrink-0 w-2 h-2 rounded-full bg-primary" />}
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
          <Image key={p.id} src={p.avatar_url} alt={p.display_name} width={40} height={40}
            className={`${size} ${pos} rounded-full object-cover ring-2 ring-surface`} />
        ) : (
          <div key={p.id}
            className={`${size} ${pos} rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center ring-2 ring-surface`}>
            {getInitials(p.display_name)}
          </div>
        )
      })}
    </div>
  )
}
