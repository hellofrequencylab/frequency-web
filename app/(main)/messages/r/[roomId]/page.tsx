import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, Users, Hash, Lock, LogIn, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getInitials } from '@/lib/utils'
import { joinRoom, leaveRoom } from '../../rooms/actions'
import { RoomThread } from '@/components/rooms/room-thread'
import { RoomSearch } from '@/components/rooms/room-search'
import { InviteToRoomButton } from '@/components/rooms/invite-to-room-button'
import { MemberRowActions } from '@/components/rooms/member-row-actions'

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params

  // RLS convergence surface 6 (migration 20260602200701): the room thread runs on
  // the user client. rooms_read / room_members_read / room_messages_read enforce
  // who can see the room, its roster, and its (members-only) messages. The member
  // + author profiles — which RLS would hide from sub-crew/cross-region viewers —
  // come from the visible_room_member_profiles DEFINER RPC (public fields, gated
  // on the caller being able to see the room).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!myProfile) redirect('/onboarding')

  const myProfileId = myProfile.id as string

  // Room (rooms_read: public/cluster-visibility OR member; a private room is
  // hidden from non-members by RLS → null → notFound)
  const { data: room } = await supabase
    .from('rooms')
    .select('id, name, description, visibility, member_count, created_at')
    .eq('id', roomId)
    .maybeSingle()

  if (!room) notFound()

  const r = room as unknown as {
    id: string
    name: string
    description: string | null
    visibility: 'public' | 'private' | 'circle' | 'hub' | 'nexus' | 'outpost' | 'channel'
    member_count: number
    created_at: string
  }

  // Check membership
  const { data: membership } = await supabase
    .from('room_members')
    .select('room_id, is_admin')
    .eq('room_id', roomId)
    .eq('profile_id', myProfileId)
    .maybeSingle()

  const isMember = !!membership
  const isAdmin = !!membership?.is_admin
  // Channel open rooms (Phase B) are read-open to anyone; posting is gated by
  // tune-in (server-side). So "can read the thread" = a member OR a channel room.
  const isChannel = r.visibility === 'channel'
  const canRead = isMember || isChannel

  // Defense in depth (RLS already hides private rooms from non-members)
  if (r.visibility === 'private' && !isMember) {
    notFound()
  }

  // Members + their public profiles via the DEFINER RPC (visible only if I can
  // see the room). Authors of messages are members, so this map hydrates both.
  type MemberProfile = { id: string; display_name: string; handle: string; avatar_url: string | null }
  const { data: memberRows } = await (supabase)
    .rpc('visible_room_member_profiles', { _room_id: roomId })

  const members = ((memberRows ?? []) as {
    id: string; display_name: string; handle: string; avatar_url: string | null; is_admin: boolean; joined_at: string
  }[]).map(m => ({
    is_admin: m.is_admin,
    joined_at: m.joined_at,
    profile: { id: m.id, display_name: m.display_name, handle: m.handle, avatar_url: m.avatar_url } as MemberProfile,
  }))

  const memberProfileMap = new Map(members.map(m => [m.profile.id, m.profile]))

  // Recent messages — members-only (room_messages_read = am_room_member). For a
  // non-member previewing a public room this returns nothing; the page shows the
  // join panel instead, so we skip the read entirely for them.
  type RoomMessageRow = { id: string; room_id: string; author_id: string; body: string; created_at: string }
  let messages: (RoomMessageRow & { author: MemberProfile | null })[] = []
  if (canRead) {
    const { data: rawMessages } = await supabase
      .from('room_messages')
      .select('id, room_id, author_id, body, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(100)
    const rawMsgs = (rawMessages ?? []) as RoomMessageRow[]

    // Channel rooms have no member roster, so resolve message authors directly
    // (public fields) rather than from the room-member map.
    if (isChannel && rawMsgs.length > 0) {
      const authorIds = [...new Set(rawMsgs.map(m => m.author_id))]
      const { data: authorRows } = await (supabase)
        .from('profiles')
        .select('id, display_name, handle, avatar_url')
        .in('id', authorIds)
      for (const a of (authorRows ?? []) as MemberProfile[]) memberProfileMap.set(a.id, a)
    }

    messages = rawMsgs.map(m => ({ ...m, author: memberProfileMap.get(m.author_id) ?? null }))
  }

  return (
    <div className="-mx-6 -my-6 flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/messages"
            className="md:hidden p-1.5 rounded-lg text-subtle hover:text-muted hover:bg-surface-elevated"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="w-9 h-9 rounded-lg bg-primary-bg flex items-center justify-center shrink-0">
            {r.visibility === 'private' ? (
              <Lock className="w-4 h-4 text-primary-strong" />
            ) : (
              <Hash className="w-4 h-4 text-primary-strong" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-text truncate">{r.name}</h1>
              <span className="text-2xs px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted capitalize">
                {r.visibility}
              </span>
            </div>
            <p className="text-xs text-subtle">
              <Users className="w-3 h-3 inline mr-1 -mt-px" />
              {r.member_count} {r.member_count === 1 ? 'member' : 'members'}
              {r.description && <> &middot; {r.description}</>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canRead && <RoomSearch roomId={roomId} />}
          {/* Channel rooms aren't "joined" — you tune into the Channel. */}
          {!isChannel && (isMember ? (
            <form action={leaveRoom.bind(null, roomId)}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated transition-colors"
              >
                <LogOut className="w-3 h-3" /> Leave
              </button>
            </form>
          ) : (
            <form action={joinRoom.bind(null, roomId)}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover transition-colors"
              >
                <LogIn className="w-3 h-3" /> Join
              </button>
            </form>
          ))}
        </div>
      </header>

      {/* Body. Three pane (messages + members on the right) */}
      <div className="flex-1 min-h-0 flex">
        {canRead ? (
          <RoomThread
            roomId={roomId}
            initialMessages={messages}
            myProfileId={myProfileId}
            canPost={canRead}
          />
        ) : (
          // Non-member previewing a public room: messages are members-only, so
          // show a join prompt rather than an empty thread.
          <div className="flex-1 min-w-0 flex items-center justify-center p-8">
            <div className="text-center max-w-xs">
              <div className="w-12 h-12 rounded-2xl bg-primary-bg flex items-center justify-center mx-auto mb-3">
                <Lock className="w-5 h-5 text-primary-strong" />
              </div>
              <p className="text-sm font-semibold text-text mb-1">Join to see the conversation</p>
              <p className="text-xs text-muted leading-relaxed mb-4">
                This room&rsquo;s messages are visible to members. Join {r.name} to read and post.
              </p>
              <form action={joinRoom.bind(null, roomId)}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-hover transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" /> Join room
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Members sidebar (desktop) */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-l border-border bg-surface/30 dark:bg-canvas/30">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-subtle mb-2">
              Members ({r.member_count})
            </h3>
            {isMember && <InviteToRoomButton roomId={roomId} />}
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-border/50">
            {members.map(m => {
              const p = m.profile!
              const isSelf = p.id === myProfileId
              return (
                <li key={p.id}>
                  <div className="group flex items-center gap-2.5 px-4 py-2 hover:bg-surface-elevated/50 transition-colors">
                    <Link href={`/people/${p.handle}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                      {p.avatar_url ? (
                        <Image src={p.avatar_url} alt={p.display_name} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-3xs font-semibold flex items-center justify-center shrink-0 select-none">
                          {getInitials(p.display_name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-text truncate">{p.display_name}</p>
                        {m.is_admin && <p className="text-3xs text-primary-strong">Admin</p>}
                      </div>
                    </Link>
                    {isAdmin && !isSelf && (
                      <MemberRowActions roomId={roomId} memberId={p.id} isAdmin={m.is_admin} />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </aside>
      </div>
    </div>
  )
}
