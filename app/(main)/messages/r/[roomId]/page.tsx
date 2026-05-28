import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Users, Hash, Lock, LogIn, LogOut } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getInitials } from '@/lib/utils'
import { joinRoom, leaveRoom } from '../../rooms/actions'
import { RoomThread } from '@/components/rooms/room-thread'
import { InviteToRoomButton } from '@/components/rooms/invite-to-room-button'
import { MemberRowActions } from '@/components/rooms/member-row-actions'

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const admin = createAdminClient()

  const { data: myProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!myProfile) redirect('/onboarding')

  const myProfileId = myProfile.id as string

  // Fetch room
  const { data: room } = await admin
    .from('rooms')
    .select(`id, name, description, visibility, member_count, created_at,
             creator:profiles!creator_id ( id, display_name, handle )`)
    .eq('id', roomId)
    .maybeSingle()

  if (!room) notFound()

  const r = room as unknown as {
    id: string
    name: string
    description: string | null
    visibility: 'public' | 'private' | 'circle' | 'hub' | 'nexus' | 'outpost'
    member_count: number
    created_at: string
    creator: { id: string; display_name: string; handle: string } | null
  }

  // Check membership
  const { data: membership } = await admin
    .from('room_members')
    .select('room_id, is_admin')
    .eq('room_id', roomId)
    .eq('profile_id', myProfileId)
    .maybeSingle()

  const isMember = !!membership
  const isAdmin = !!membership?.is_admin

  // Block private rooms for non-members
  if (r.visibility === 'private' && !isMember) {
    notFound()
  }

  // Fetch members
  const { data: rawMembers } = await admin
    .from('room_members')
    .select(`is_admin, joined_at,
             profile:profiles!profile_id ( id, display_name, handle, avatar_url )`)
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true })
    .limit(50)

  const members = ((rawMembers ?? []) as unknown as {
    is_admin: boolean
    joined_at: string
    profile: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  }[]).filter(m => m.profile)

  // Fetch recent messages
  const { data: rawMessages } = await admin
    .from('room_messages')
    .select(`id, room_id, author_id, body, created_at,
             author:profiles!author_id ( id, display_name, handle, avatar_url )`)
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(100)

  const messages = ((rawMessages ?? []) as unknown as {
    id: string
    room_id: string
    author_id: string
    body: string
    created_at: string
    author: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  }[])

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
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-surface-elevated text-muted capitalize">
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

        {isMember ? (
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
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover transition-colors"
            >
              <LogIn className="w-3 h-3" /> Join
            </button>
          </form>
        )}
      </header>

      {/* Body — three pane (messages + members on the right) */}
      <div className="flex-1 min-h-0 flex">
        <RoomThread
          roomId={roomId}
          initialMessages={messages}
          myProfileId={myProfileId}
          canPost={isMember}
        />

        {/* Members sidebar (desktop) */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-l border-border bg-surface/30 dark:bg-canvas/30">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle mb-2">
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
                        <img src={p.avatar_url} alt={p.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-[10px] font-semibold flex items-center justify-center shrink-0 select-none">
                          {getInitials(p.display_name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-text truncate">{p.display_name}</p>
                        {m.is_admin && <p className="text-[10px] text-primary-strong">Admin</p>}
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
