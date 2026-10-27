import Link from 'next/link'
import type { RoomVisibility } from '@/lib/messages/room-access'
import { InviteToRoomButton } from './invite-to-room-button'
import { MemberRowActions } from './member-row-actions'

export type VisibleRoomMember = {
  is_admin: boolean
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null }
}

/** Uses only the room's existing caller-gated public roster; no privileged read. */
export function RoomMembers({ roomId, myProfileId, canRead, isMember, isAdmin, visibility, members, totalMembers }: {
  roomId: string; myProfileId: string; canRead: boolean; isMember: boolean; isAdmin: boolean
  visibility: RoomVisibility; members: VisibleRoomMember[]; totalMembers: number
}) {
  if (!canRead || visibility === 'channel') return null
  const canInvite = isMember && (visibility !== 'private' || isAdmin)
  return (
    <details className="border-t border-border px-4 py-3">
      <summary className="cursor-pointer text-meta font-semibold">Room members</summary>
      <div className="mt-3 space-y-3">
        {canInvite && <InviteToRoomButton roomId={roomId} />}
        <ul aria-label="Room members" className="space-y-1">
          {members.map(({ profile, is_admin }) => (
            <li key={profile.id} className="flex items-center justify-between gap-2">
              <Link href={`/people/${encodeURIComponent(profile.handle)}`} className="min-w-0 truncate text-meta">
                {profile.display_name}{profile.id === myProfileId ? ' (you)' : ''}{is_admin ? ' · Admin' : ''}
              </Link>
              {isAdmin && profile.id !== myProfileId && (
                <MemberRowActions roomId={roomId} memberId={profile.id} memberName={profile.display_name} isAdmin={is_admin} />
              )}
            </li>
          ))}
        </ul>
        {totalMembers > members.length && <p className="text-meta text-muted">Showing {members.length} of {totalMembers} members.</p>}
      </div>
    </details>
  )
}
