import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, Users, Hash, LogIn, LogOut, MessageCircle, Radio } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { isOnline } from '@/lib/presence'
import { PresenceDot } from '@/components/presence/presence-dot'
import { PageHeading } from '@/components/templates'
import { Counter, CounterRow } from '@/components/ui/counter'
import { GateNotice } from '@/components/ui/gate-notice'
import { joinRoom, leaveRoom } from '../../rooms/actions'
import { RoomThread } from '@/components/rooms/room-thread'
import { RoomSearch } from '@/components/rooms/room-search'
import { InviteToRoomButton } from '@/components/rooms/invite-to-room-button'
import { MemberRowActions } from '@/components/rooms/member-row-actions'
import { RoomSettings } from '@/components/rooms/room-settings'

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
    supabase.from('rooms').select('id, name, description, visibility, member_count, created_at').eq('id', roomId).maybeSingle(),
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
    visibility: 'public' | 'private' | 'circle' | 'hub' | 'nexus' | 'outpost' | 'channel'
    member_count: number
    created_at: string
  }

  const { data: membership } = membershipRes
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

  // The roster reads "who is here" first: active members lead, then everyone else in
  // join order (the RPC's order, preserved by the stable sort).
  const sortedMembers = [...members].sort(
    (a, b) => (onlineIds.has(b.profile.id) ? 1 : 0) - (onlineIds.has(a.profile.id) ? 1 : 0),
  )

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

  // The room glyph leads the compact takeover bar beside the shared PageHeading title.
  // Always the hash — a room never wears a padlock (GateNotice canon); the visibility
  // badge beside the title already says "private" in words.
  const roomGlyph = (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg">
      <Hash className="h-4 w-4 text-primary-strong" />
    </span>
  )

  const titleNode = (
    <span className="inline-flex items-center gap-2">
      {r.name}
      <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs capitalize text-muted">
        {r.visibility}
      </span>
    </span>
  )

  const subtitle = (
    <span className="inline-flex items-center">
      <Users className="mr-1 -mt-px inline h-3 w-3" />
      {r.member_count} {r.member_count === 1 ? 'member' : 'members'}
      {r.description && <> &middot; {r.description}</>}
    </span>
  )

  // Bleed the chat surface to the shell's edges. The negative margin must MIRROR the shell's
  // responsive padding (px-4 sm:px-6 lg:px-8); a flat -mx-6 over-pulled on mobile (bleeding 8px
  // past the viewport and causing a horizontal scroll) and under-pulled at lg. dvh, not vh, so
  // the iOS dynamic toolbar does not push the composer off-screen.
  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 flex flex-col h-[calc(100dvh-var(--app-header-h)-var(--tab-bar-h))] md:h-[calc(100dvh-var(--app-header-h))]">
      {/* Takeover chat bar — bespoke, full-bleed chrome (the documented exception,
          MEMBER-DESIGN-SYSTEM §207), with the room identity title routed through the
          shared PageHeading grammar instead of a hand-rolled <h1>. */}
      {/* header-ok: conversation pane, not a page header — bespoke takeover chrome (§207); the title routes through PageHeading */}
      <header className="flex shrink-0 items-center gap-3 bg-surface px-5 py-3">
        <Link
          href="/messages"
          className="md:hidden -ml-1 rounded-lg p-1.5 text-subtle hover:bg-surface-elevated hover:text-muted"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        {roomGlyph}
        {/* Compact takeover register: PageHeading carries the title/meta semantics, but
            the bar tones its page-band scale down (no bottom margin, base title, xs meta). */}
        <div className="min-w-0 flex-1 [&>div]:mb-0 [&_h1]:mb-0 [&_h1]:truncate [&_h1]:text-body [&_h1]:sm:text-body [&_p]:text-meta">
          <PageHeading
            title={titleNode}
            description={subtitle}
            divider={false}
            adminBar={false}
            inlineActions
            actions={
              <div className="flex shrink-0 items-center gap-2">
                {canRead && <RoomSearch roomId={roomId} />}
                {isAdmin && (
                  <RoomSettings roomId={roomId} name={r.name} description={r.description} visibility={r.visibility} />
                )}
                {/* Channel rooms aren't "joined" — you tune into the Channel. */}
                {!isChannel && (isMember ? (
                  <form action={leaveRoom.bind(null, roomId)}>
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-meta font-medium text-muted transition-colors hover:bg-surface-elevated"
                    >
                      <LogOut className="h-3 w-3" /> Leave
                    </button>
                  </form>
                ) : (
                  <form action={joinRoom.bind(null, roomId)}>
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                    >
                      <LogIn className="h-3 w-3" /> Join
                    </button>
                  </form>
                ))}
              </div>
            }
          />
        </div>
      </header>

      {/* The room strip (DAWN room law): three counts so a live room reads differently
          from a dead one before a single message is read. Every number is a thing that
          happened — members joined, messages sent, people active now — never a
          time-on-page. Closed below by the rule-amber chrome band, where the reference
          separates the room's identity from its conversation. */}
      <div className="shrink-0 bg-surface px-5 pb-2.5">
        <CounterRow>
          <Counter value={r.member_count} label="in the room" glyph={Users} />
          {canRead && <Counter value={weekCount} label="messages this week" glyph={MessageCircle} />}
          {hereNowCount > 0 && <Counter value={hereNowCount} label="active now" glyph={Radio} />}
        </CounterRow>
      </div>
      <hr className="rule-amber shrink-0" />

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
          // Non-member previewing a public room: messages are members-only. The gate is
          // a GateNotice, never a padlock panel (DAWN room law) — say why the room is
          // closed and what opens it, then offer the door.
          <div className="flex-1 min-w-0 flex items-center justify-center p-8">
            <div className="w-full max-w-sm">
              <GateNotice kind="gated" title="Join to read the room">
                What gets said in {r.name} stays between its members. Join and the whole
                conversation opens, along with the composer.
              </GateNotice>
              <form action={joinRoom.bind(null, roomId)} className="mt-4 flex justify-center">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-meta font-semibold text-on-primary hover:bg-primary-hover transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" /> Join room
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Members sidebar (desktop) — "who is here" comes first: active members lead
            the roster, each wearing the shared PresenceDot. */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-l border-border bg-surface/30 dark:bg-canvas/30">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted mb-2">
              In the room ({r.member_count})
            </h3>
            {isMember && <InviteToRoomButton roomId={roomId} />}
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-border/50">
            {sortedMembers.map(m => {
              const p = m.profile!
              const isSelf = p.id === myProfileId
              return (
                <li key={p.id}>
                  <div className="group flex items-center gap-2.5 px-4 py-2 hover:bg-surface-elevated/50 transition-colors">
                    <Link href={`/people/${p.handle}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="relative shrink-0">
                        {p.avatar_url ? (
                          <Image src={avatarSrc(p.avatar_url)} alt={p.display_name} width={28} height={28} className="w-7 h-7 rounded-pill object-cover" style={avatarFocusStyle(p.avatar_url)} />
                        ) : (
                          <span className="w-7 h-7 rounded-pill bg-primary-bg text-primary-strong text-3xs font-semibold flex items-center justify-center select-none">
                            {getInitials(p.display_name)}
                          </span>
                        )}
                        <PresenceDot online={onlineIds.has(p.id)} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-meta font-medium text-text truncate">{p.display_name}</p>
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
