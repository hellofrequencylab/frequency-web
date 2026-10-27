import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isOnline } from '@/lib/presence'
import { joinRoom, leaveRoom } from '../../rooms/actions'
import { RoomThread } from '@/components/rooms/room-thread'
import { canReadRoom, canPostToRoom, type RoomVisibility } from '@/lib/messages/room-access'
import { RoomSearch } from '@/components/rooms/room-search'
import { RoomSettings } from '@/components/rooms/room-settings'
import { RoomMembers } from '@/components/rooms/room-members'
import { FqIcon } from '@/components/frequency/icon'
import { FrequencyMessages } from '@/components/frequency/members/messages/messages-body'

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

  // The room row, my membership, the visible member roster, AND the recent messages are all keyed on
  // roomId/myProfileId alone, so fetch them in ONE wave (D3: the message read used to run as a second
  // round-trip after the membership resolved; RLS (room_messages_read = am_room_member, channel rooms
  // read-open) already returns nothing to a non-member, so reading optimistically leaks nothing — the
  // canRead gate below still decides what renders).
  type MemberProfile = { id: string; display_name: string; handle: string; avatar_url: string | null }
  const weekAgoIso = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [roomRes, membershipRes, memberRowsRes, rawMessagesRes, weekCountRes] = await Promise.all([
    // `scope_id` joins the wave because a Channel room's POST gate is tune-in, not membership
    // (see lib/messages/room-access.ts) and the tune-in row is keyed on it.
    supabase.from('rooms').select('id, name, description, visibility, member_count, created_at, scope_id').eq('id', roomId).maybeSingle(),
    supabase.from('room_members').select('room_id, is_admin').eq('room_id', roomId).eq('profile_id', myProfileId).maybeSingle(),
    (supabase).rpc('visible_room_member_profiles', { _room_id: roomId }),
    // Newest 100 descending (reversed to chronological below) — ascending + limit would pin busy
    // rooms to their first-ever 100 and never show recent conversation (matches the DM thread).
    supabase
      .from('room_messages')
      .select('id, room_id, author_id, body, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(100),
    // The room strip's "this week" count (DAWN room law: every number is a thing that
    // happened). Head-only count, RLS-gated like the message read — a non-member gets 0,
    // and the strip only shows the counter when the viewer can read the thread anyway.
    supabase
      .from('room_messages')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .gte('created_at', weekAgoIso),
  ])

  // rooms_read: public/cluster-visibility OR member; a private room is hidden from
  // non-members by RLS → null → notFound.
  const { data: room } = roomRes
  if (!room) notFound()

  const r = room as unknown as {
    id: string
    name: string
    description: string | null
    visibility: RoomVisibility
    member_count: number
    created_at: string
    scope_id: string | null
  }

  const { data: membership } = membershipRes
  const isMember = !!membership
  const isAdmin = !!membership?.is_admin
  const isChannel = r.visibility === 'channel'
  // Reading and posting are DIFFERENT questions and this page used to collapse them
  // (`canPost={canRead}`). A Channel room is read-open to anyone; posting into one asks for
  // tune-in, which is exactly what sendRoomMessage checks. The shared rule lives in
  // lib/messages/room-access.ts so the dock's inline thread cannot answer differently.
  const canRead = canReadRoom({ visibility: r.visibility, isMember })

  // Tune-in, read only when it can matter. `tcm: read own` (migration 20260613000050) scopes
  // this to the caller's own row on the user client, so it leaks nothing about who else is here.
  let isTunedIn = false
  if (isChannel && r.scope_id) {
    const { data: tuned } = await supabase
      .from('topical_channel_memberships')
      .select('profile_id')
      .eq('topical_channel_id', r.scope_id)
      .eq('profile_id', myProfileId)
      .maybeSingle()
    isTunedIn = !!tuned
  }
  const canPost = canPostToRoom({ visibility: r.visibility, isMember, isTunedIn })

  // Defense in depth (RLS already hides private rooms from non-members)
  if (r.visibility === 'private' && !isMember) {
    notFound()
  }

  // Members + their public profiles via the DEFINER RPC (visible only if I can see the room).
  // Authors of messages are members, so this map hydrates both.
  const { data: memberRows } = memberRowsRes

  const members = ((memberRows ?? []) as {
    id: string; display_name: string; handle: string; avatar_url: string | null; is_admin: boolean; joined_at: string
  }[]).map(m => ({
    is_admin: m.is_admin,
    joined_at: m.joined_at,
    profile: { id: m.id, display_name: m.display_name, handle: m.handle, avatar_url: m.avatar_url } as MemberProfile,
  }))

  const memberProfileMap = new Map(members.map(m => [m.profile.id, m.profile]))

  // Who is here NOW — the repo's existing presence mechanism (the ~90s last_seen_at
  // heartbeat behind PresenceDot, lib/presence.ts), read the same way the /messages
  // inbox reads it: admin client, because last_seen_at is public but region-scoped
  // profile RLS would hide some rows. No new realtime infrastructure.
  const memberIds = members.map(m => m.profile.id)
  let onlineIds = new Set<string>()
  if (memberIds.length > 0) {
    const { data: seenRows } = await createAdminClient()
      .from('profiles')
      .select('id, last_seen_at')
      .in('id', memberIds)
    onlineIds = new Set(
      ((seenRows ?? []) as { id: string; last_seen_at: string | null }[])
        .filter(s => isOnline(s.last_seen_at))
        .map(s => s.id),
    )
  }
  const hereNowCount = onlineIds.size


  const weekCount = weekCountRes.count ?? 0

  // Recent messages — fetched in the first wave above (RLS-gated); rendered only when canRead
  // (a non-member previewing a public room sees the join panel instead).
  type RoomMessageRow = { id: string; room_id: string; author_id: string; body: string; created_at: string }
  let messages: (RoomMessageRow & { author: MemberProfile | null })[] = []
  if (canRead) {
    const rawMsgs = (((rawMessagesRes.data ?? []) as RoomMessageRow[])).reverse()

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
    <FrequencyMessages
      supabase={supabase}
      myProfileId={myProfileId}
      activeKey={`room:${roomId}`}
      pane={
        <section className="panel fa-pane" aria-label={r.name}>
          <div className="row fa-pane-h">
            <Link href="/messages" className="btn txt sm fqm-msg-back" aria-label="All messages">←</Link>
            <span className="ic" aria-hidden><FqIcon name="circle" /></span>
            <span className="grow">
              <span className="t1" style={{ display: 'block' }}>{r.name}</span>
              <span className="t2">
                {[
                  `${r.member_count} ${r.member_count === 1 ? 'member' : 'members'}`,
                  canRead ? `${weekCount} this week` : null,
                  hereNowCount > 0 ? `${hereNowCount} active now` : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </span>
            {canRead && <RoomSearch roomId={roomId} />}
            {isAdmin && <RoomSettings roomId={roomId} name={r.name} description={r.description} visibility={r.visibility} scopeId={r.scope_id} />}
            {!isChannel && (isMember ? (
              <form action={leaveRoom.bind(null, roomId)}>
                <button type="submit" className="btn sm">Leave</button>
              </form>
            ) : (
              <form action={joinRoom.bind(null, roomId)}>
                <button type="submit" className="btn sm pa">Join</button>
              </form>
            ))}
          </div>
          <RoomMembers roomId={roomId} myProfileId={myProfileId} canRead={canRead} isMember={isMember} isAdmin={isAdmin} visibility={r.visibility} members={members} totalMembers={r.member_count} />
          {canRead ? (
            <div className="fa-room">
              <RoomThread roomId={roomId} initialMessages={messages} myProfileId={myProfileId} canPost={canPost} visibility={r.visibility} />
            </div>
          ) : (
            <div className="fa-pane-empty">
              <span className="h3">Join to read the room</span>
              <span className="t2">What gets said in {r.name} stays between its members. Join and the whole conversation opens.</span>
              <form action={joinRoom.bind(null, roomId)}>
                <button type="submit" className="btn pa">Join room</button>
              </form>
            </div>
          )}
        </section>
      }
    />
  )
}
