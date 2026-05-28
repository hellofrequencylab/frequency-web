import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MessageSquare, Hash, Lock, Users, Compass, Sparkles, Zap } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getInitials, relativeTime } from '@/lib/utils'
import { isOnline } from '@/lib/presence'
import { NewRoomCompose } from '@/components/compose/new-room-compose'
import { NewGroupDMCompose } from '@/components/compose/new-group-dm-compose'
import { CrewLeadQuickAction } from '@/components/messages/crew-lead-quick-action'

type Profile = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
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

function SidebarCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-subtle" />}
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{title}</h3>
      </div>
      {children}
    </div>
  )
}

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

  const admin = createAdminClient()

  const { data: myProfile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!myProfile) redirect('/onboarding')
  const myProfileId = myProfile.id as string
  const canCreateRoom = CREW_PLUS.includes(myProfile.community_role as CommunityRole)

  // ── Rooms ─────────────────────────────────────────────────────────
  const { data: myMemberships } = await admin
    .from('room_members')
    .select('room_id, last_read_at')
    .eq('profile_id', myProfileId)

  const joinedRoomIds = (myMemberships ?? []).map((m: { room_id: string }) => m.room_id)

  const { data: myRoomsData } = joinedRoomIds.length > 0
    ? await admin
        .from('rooms')
        .select('id, name, description, visibility, member_count, last_message_at')
        .in('id', joinedRoomIds)
        .order('last_message_at', { ascending: false, nullsFirst: false })
    : { data: [] }

  const myRooms: RoomRow[] = ((myRoomsData ?? []) as Omit<RoomRow, 'isMember'>[])
    .map(r => ({ ...r, isMember: true }))

  // Discover: public rooms not yet joined
  const { data: publicRoomsData } = await admin
    .from('rooms')
    .select('id, name, description, visibility, member_count, last_message_at')
    .eq('visibility', 'public')
    .order('member_count', { ascending: false })
    .limit(10)

  const discoverRooms: RoomRow[] = ((publicRoomsData ?? []) as Omit<RoomRow, 'isMember'>[])
    .filter(r => !joinedRoomIds.includes(r.id))
    .map(r => ({ ...r, isMember: false }))

  // ── DMs ───────────────────────────────────────────────────────────
  const { data: myParts } = await admin
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
    const { data: allParts } = await admin
      .from('conversation_participants')
      .select('conversation_id, profile_id, profiles!profile_id(id, display_name, handle, avatar_url)')
      .in('conversation_id', convIds)
      .neq('profile_id', myProfileId)
    for (const p of allParts ?? []) {
      const cid = p.conversation_id as string
      const prof = p.profiles as unknown as Profile | null
      if (!prof) continue
      if (!otherPartMap[cid]) otherPartMap[cid] = []
      otherPartMap[cid].push(prof)
    }
  }

  const messagesByConv: Record<string, Array<{ id: string; conversation_id: string; sender_id: string; body: string; created_at: string }>> = {}
  if (convIds.length > 0) {
    const { data: recentMessages } = await admin
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

  const totalUnread =
    conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  // ── Conversation prompt: new members in user's circles (last 7 days) ─
  const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: myCircleMemberships } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', myProfileId)
    .eq('status', 'active')

  const myCircleIds = (myCircleMemberships ?? []).map((m: { circle_id: string }) => m.circle_id as string)

  const newMembers: { profile_id: string; display_name: string; handle: string; avatar_url: string | null; last_seen_at: string | null }[] = []
  if (myCircleIds.length > 0) {
    const { data: recent } = await admin
      .from('memberships')
      .select('profile_id, joined_at, profile:profiles!profile_id(id, display_name, handle, avatar_url, last_seen_at)')
      .in('circle_id', myCircleIds)
      .eq('status', 'active')
      .neq('profile_id', myProfileId)
      .gte('joined_at', sevenDaysAgo)
      .order('joined_at', { ascending: false })
      .limit(5)

    const seen = new Set<string>()
    for (const r of recent ?? []) {
      const prof = (r as unknown as { profile: (Profile & { last_seen_at: string | null }) | null }).profile
      if (!prof || seen.has(prof.id)) continue
      seen.add(prof.id)
      newMembers.push({
        profile_id: prof.id,
        display_name: prof.display_name,
        handle: prof.handle,
        avatar_url: prof.avatar_url,
        last_seen_at: prof.last_seen_at,
      })
    }
  }

  return (
    <div>

      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">
            Messages
            {totalUnread > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-on-primary text-[10px] font-bold align-middle">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted leading-relaxed max-w-lg">
            One hub for every conversation — direct messages, group threads, and rooms with the community.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <CrewLeadQuickAction />
          <NewGroupDMCompose />
          {canCreateRoom && <NewRoomCompose />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Main column ──────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Active Now */}
          {activeItems.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-3">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                </span>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-signal-strong">
                  Active Now <span className="text-subtle">· {activeItems.length}</span>
                </h2>
              </div>
              <div className="space-y-1">
                {activeItems.map(it =>
                  it.kind === 'room'
                    ? <RoomRow key={`r-${it.id}`} room={it.room} />
                    : <DMRow key={`d-${it.id}`} conv={it.conv} myProfileId={myProfileId} />
                )}
              </div>
            </section>
          )}

          {/* Your Threads */}
          <section>
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-subtle">
                Your Threads {filteredItems.length > 0 && <span className="text-subtle">· {filteredItems.length}</span>}
              </h2>
              <div className="flex items-center gap-0.5 bg-surface-elevated rounded-lg p-0.5">
                {FILTERS.map(f => (
                  <Link
                    key={f.value}
                    href={f.value === 'all' ? '/messages' : `/messages?filter=${f.value}`}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      filter === f.value
                        ? 'bg-white text-text shadow-sm'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    {f.label}
                  </Link>
                ))}
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface/50 dark:bg-canvas/50 p-8 text-center">
                <MessageSquare className="w-7 h-7 text-subtle/60 mx-auto mb-2" />
                <p className="text-sm text-muted">
                  {filter === 'rooms' ? 'No rooms joined yet.' :
                    filter === 'dms'   ? 'No direct conversations yet.' :
                                         'Your threads will appear here.'}
                </p>
                <p className="text-xs text-subtle mt-1">
                  {filter === 'rooms' && (canCreateRoom ? 'Create one above or browse Discover.' : 'Join one from Discover below.')}
                  {filter === 'dms'   && 'Start one from any member’s profile.'}
                  {filter === 'all'   && 'Join a room or start a DM to begin.'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredItems.map(it =>
                  it.kind === 'room'
                    ? <RoomRow key={`r-${it.id}`} room={it.room} />
                    : <DMRow key={`d-${it.id}`} conv={it.conv} myProfileId={myProfileId} />
                )}
              </div>
            )}
          </section>

          {/* Discover — only when not filtered to DMs */}
          {filter !== 'dms' && discoverRooms.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-3">
                <Compass className="w-3.5 h-3.5 text-subtle" />
                <h2 className="text-xs font-semibold uppercase tracking-widest text-subtle">
                  Discover
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {discoverRooms.slice(0, 6).map(room => (
                  <Link
                    key={room.id}
                    href={`/messages/r/${room.id}`}
                    className="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 hover:border-primary-bg dark:hover:border-primary hover:bg-primary-bg/30 dark:hover:bg-primary-bg transition-colors"
                  >
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-primary-bg flex items-center justify-center">
                      <Hash className="w-3.5 h-3.5 text-primary-strong" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text truncate">{room.name}</p>
                      <p className="text-[11px] text-subtle truncate">
                        <Users className="w-2.5 h-2.5 inline mr-0.5 -mt-px" />
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

        {/* ── In-page context column ───────────────────────────── */}
        <div className="space-y-4">

          {/* Welcome them — conversation prompt */}
          {newMembers.length > 0 && (
            <SidebarCard title="Say hi" icon={Sparkles}>
              <div className="px-4 py-3">
                <p className="text-xs text-muted mb-3 leading-snug">
                  {newMembers.length === 1
                    ? '1 new member joined your circles this week.'
                    : `${newMembers.length} new members joined your circles this week.`}
                </p>
                <ul className="space-y-1.5">
                  {newMembers.map(m => {
                    const online = isOnline(m.last_seen_at)
                    return (
                      <li key={m.profile_id}>
                        <Link
                          href={`/people/${m.handle}`}
                          className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-elevated transition-colors"
                        >
                          <div className="relative shrink-0">
                            {m.avatar_url ? (
                              <img src={m.avatar_url} alt={m.display_name} className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-border-strong flex items-center justify-center text-[10px] font-bold text-muted select-none">
                                {getInitials(m.display_name)}
                              </div>
                            )}
                            {online && (
                              <span
                                aria-label="Online now"
                                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-surface"
                              />
                            )}
                          </div>
                          <span className="text-xs font-medium text-text truncate flex-1">{m.display_name}</span>
                          <MessageSquare className="w-3 h-3 text-subtle shrink-0" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </SidebarCard>
          )}

          {/* Quick actions */}
          <SidebarCard title="Quick Actions" icon={Zap}>
            <div className="px-4 py-3 space-y-2">
              <p className="text-[11px] text-muted leading-snug">
                Start a fresh conversation with anyone, or open a new room around a topic.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <NewGroupDMCompose />
                {canCreateRoom && <NewRoomCompose />}
              </div>
            </div>
          </SidebarCard>

          {/* Discover (sidebar variant) */}
          {discoverRooms.length > 6 && (
            <SidebarCard title="Discover Rooms" icon={Compass}>
              <ul className="divide-y divide-border">
                {discoverRooms.slice(6, 12).map(room => (
                  <li key={room.id}>
                    <Link
                      href={`/messages/r/${room.id}`}
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-elevated transition-colors"
                    >
                      <Hash className="w-3.5 h-3.5 text-subtle shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-text truncate">{room.name}</p>
                        <p className="text-[10px] text-subtle">
                          <Users className="w-2.5 h-2.5 inline mr-0.5 -mt-px" />
                          {room.member_count}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </SidebarCard>
          )}
        </div>
      </div>
    </div>
  )
}

function RoomRow({ room }: { room: RoomRow }) {
  return (
    <Link
      href={`/messages/r/${room.id}`}
      className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-elevated transition-colors"
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
            <span className="text-[11px] text-subtle shrink-0">{relativeTime(room.last_message_at)}</span>
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

function DMRow({ conv, myProfileId }: { conv: ConversationRow; myProfileId: string }) {
  const hasUnread = conv.unreadCount > 0
  const isGroup = conv.participants.length > 1
  const display = conv.name || (isGroup
    ? conv.participants.slice(0, 3).map(p => p.display_name.split(' ')[0]).join(', ') +
      (conv.participants.length > 3 ? ` +${conv.participants.length - 3}` : '')
    : conv.participants[0]?.display_name ?? 'Unknown')

  return (
    <Link
      href={`/messages/${conv.id}`}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors ${
        hasUnread
          ? 'bg-primary-bg/70 hover:bg-primary-bg dark:hover:bg-primary-bg'
          : 'hover:bg-surface-elevated'
      }`}
    >
      <div className="shrink-0">
        {isGroup ? (
          <GroupAvatars participants={conv.participants} />
        ) : conv.participants[0]?.avatar_url ? (
          <img src={conv.participants[0].avatar_url!} alt={conv.participants[0].display_name} className="w-10 h-10 rounded-full object-cover" />
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
            <span className="text-[11px] text-subtle shrink-0">{relativeTime(conv.lastMessage.created_at)}</span>
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
          <img key={p.id} src={p.avatar_url} alt={p.display_name}
            className={`${size} ${pos} rounded-full object-cover ring-2 ring-surface`} />
        ) : (
          <div key={p.id}
            className={`${size} ${pos} rounded-full bg-primary-bg text-primary-strong text-[9px] font-semibold flex items-center justify-center ring-2 ring-surface`}>
            {getInitials(p.display_name)}
          </div>
        )
      })}
    </div>
  )
}
