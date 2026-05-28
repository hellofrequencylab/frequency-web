import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MessageSquare, Hash, Lock, Users, Compass } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getInitials, relativeTime } from '@/lib/utils'
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

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'
const CREW_PLUS: CommunityRole[] = ['crew', 'host', 'guide', 'mentor', 'janitor']

export default async function MessagesPage() {
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
  // Joined rooms (sorted by recent activity)
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
  let discoverRooms: RoomRow[] = []
  const { data: publicRoomsData } = await admin
    .from('rooms')
    .select('id, name, description, visibility, member_count, last_message_at')
    .eq('visibility', 'public')
    .order('member_count', { ascending: false })
    .limit(10)

  discoverRooms = ((publicRoomsData ?? []) as Omit<RoomRow, 'isMember'>[])
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

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)
  const totalRooms = myRooms.length

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1">
            Messages
            {totalUnread > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold align-middle">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Direct messages with friends and chat rooms with the community.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <CrewLeadQuickAction />
          <NewGroupDMCompose />
          {canCreateRoom && <NewRoomCompose />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column: Rooms + DMs */}
        <div className="lg:col-span-2 space-y-6">

          {/* Rooms */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                Rooms {totalRooms > 0 && <span className="text-gray-300 dark:text-gray-600">· {totalRooms}</span>}
              </h2>
            </div>

            {myRooms.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 p-8 text-center">
                <Hash className="w-7 h-7 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No rooms joined yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  {canCreateRoom ? 'Create a room above or browse discoverable ones below.' : 'Discover and join public rooms below.'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {myRooms.map(room => <RoomRow key={room.id} room={room} />)}
              </div>
            )}
          </section>

          {/* Direct Messages */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
              Direct messages {conversations.length > 0 && <span className="text-gray-300 dark:text-gray-600">· {conversations.length}</span>}
            </h2>

            {conversations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 p-8 text-center">
                <MessageSquare className="w-7 h-7 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No conversations yet.</p>
                <p className="text-xs text-gray-400 mt-1">Start one from any member&apos;s profile.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map(conv => <DMRow key={conv.id} conv={conv} myProfileId={myProfileId} />)}
              </div>
            )}
          </section>
        </div>

        {/* Right sidebar: Discover rooms */}
        <div className="space-y-4">
          {discoverRooms.length > 0 && (
            <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800/50 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-gray-400" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Discover Rooms</h3>
              </div>
              <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                {discoverRooms.map(room => (
                  <li key={room.id}>
                    <Link
                      href={`/messages/r/${room.id}`}
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <Hash className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{room.name}</p>
                        <p className="text-[10px] text-gray-400">
                          <Users className="w-2.5 h-2.5 inline mr-0.5 -mt-px" />
                          {room.member_count}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
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
      className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    >
      <div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
        {room.visibility === 'private'
          ? <Lock className="w-4 h-4 text-indigo-500" />
          : <Hash className="w-4 h-4 text-indigo-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{room.name}</span>
          {room.last_message_at && (
            <span className="text-[11px] text-gray-400 shrink-0">{relativeTime(room.last_message_at)}</span>
          )}
        </div>
        <p className="text-xs text-gray-400 truncate">
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
          ? 'bg-indigo-50/70 hover:bg-indigo-50 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/30'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <div className="shrink-0">
        {isGroup ? (
          <GroupAvatars participants={conv.participants} />
        ) : conv.participants[0]?.avatar_url ? (
          <img src={conv.participants[0].avatar_url!} alt={conv.participants[0].display_name} className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-sm font-semibold flex items-center justify-center select-none">
            {conv.participants[0] ? getInitials(conv.participants[0].display_name) : '?'}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${hasUnread ? 'font-semibold text-gray-900 dark:text-gray-50' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
            {display}
          </span>
          {conv.lastMessage && (
            <span className="text-[11px] text-gray-400 shrink-0">{relativeTime(conv.lastMessage.created_at)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className={`text-xs truncate flex-1 ${hasUnread ? 'text-gray-700 dark:text-gray-300 font-medium' : 'text-gray-400'}`}>
            {conv.lastMessage
              ? conv.lastMessage.sender_id === myProfileId ? `You: ${conv.lastMessage.body}` : conv.lastMessage.body
              : 'No messages yet'}
          </p>
          {hasUnread && <span className="shrink-0 w-2 h-2 rounded-full bg-indigo-500" />}
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
            className={`${size} ${pos} rounded-full object-cover ring-2 ring-white dark:ring-gray-900`} />
        ) : (
          <div key={p.id}
            className={`${size} ${pos} rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[9px] font-semibold flex items-center justify-center ring-2 ring-white dark:ring-gray-900`}>
            {getInitials(p.display_name)}
          </div>
        )
      })}
    </div>
  )
}
