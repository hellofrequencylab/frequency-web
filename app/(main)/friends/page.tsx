import { notFound } from 'next/navigation'
import Link from 'next/link'
import { UserPlus, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials } from '@/lib/utils'
import {
  AcceptDeclineButtons,
  CancelOutgoingButton,
  UnfriendButton,
} from './friend-row-actions'

type FriendshipRow = {
  id: string
  user_a_id: string
  user_b_id: string
  requested_by: string
  status: 'pending' | 'accepted'
  requested_at: string
}

type ProfileLite = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
}

export default async function FriendsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) notFound()
  const myId = me.id as string

  // All friendships where I'm a party
  const { data: rawRows } = await admin
    .from('friendships')
    .select('id, user_a_id, user_b_id, requested_by, status, requested_at')
    .or(`user_a_id.eq.${myId},user_b_id.eq.${myId}`)
    .order('requested_at', { ascending: false })

  const rows = (rawRows ?? []) as FriendshipRow[]

  // Fetch profiles for the other party in each row
  const otherIds = Array.from(new Set(rows.map((r) => (r.user_a_id === myId ? r.user_b_id : r.user_a_id))))
  let profilesById = new Map<string, ProfileLite>()
  if (otherIds.length > 0) {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .in('id', otherIds)
    for (const p of (profs ?? []) as ProfileLite[]) {
      profilesById.set(p.id, p)
    }
  }

  const incoming = rows.filter((r) => r.status === 'pending' && r.requested_by !== myId)
  const outgoing = rows.filter((r) => r.status === 'pending' && r.requested_by === myId)
  const accepted = rows.filter((r) => r.status === 'accepted')

  function getOther(r: FriendshipRow): ProfileLite | undefined {
    return profilesById.get(r.user_a_id === myId ? r.user_b_id : r.user_a_id)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Friends</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage friend requests and your friends list. You must be friends to start a direct message or group DM.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-8">
          {/* Incoming requests */}
          {incoming.length > 0 && (
            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                Incoming Requests <span className="text-gray-300">·</span> {incoming.length}
              </h2>
              <div className="space-y-2">
                {incoming.map((r) => {
                  const other = getOther(r)
                  if (!other) return null
                  return (
                    <FriendRow key={r.id} profile={other}>
                      <AcceptDeclineButtons requesterId={other.id} />
                    </FriendRow>
                  )
                })}
              </div>
            </section>
          )}

          {/* Outgoing requests */}
          {outgoing.length > 0 && (
            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                Outgoing Requests <span className="text-gray-300">·</span> {outgoing.length}
              </h2>
              <div className="space-y-2">
                {outgoing.map((r) => {
                  const other = getOther(r)
                  if (!other) return null
                  return (
                    <FriendRow key={r.id} profile={other}>
                      <CancelOutgoingButton addresseeId={other.id} />
                    </FriendRow>
                  )
                })}
              </div>
            </section>
          )}

          {/* Accepted friends */}
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Friends <span className="text-gray-300">·</span> {accepted.length}
            </h2>
            {accepted.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-10 text-center">
                <Users className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-3">No friends yet.</p>
                <Link
                  href="/people"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Find people
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {accepted.map((r) => {
                  const other = getOther(r)
                  if (!other) return null
                  return (
                    <FriendRow key={r.id} profile={other}>
                      <UnfriendButton otherId={other.id} />
                    </FriendRow>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100/80 dark:border-gray-800/50">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">About Friends</h3>
            </div>
            <p className="px-4 py-3 text-xs text-gray-400">
              You must be friends to start a 1:1 DM or a group DM. Send a request from anyone&apos;s profile.
              Existing conversations stay accessible to their members regardless of friendship status.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function FriendRow({
  profile,
  children,
}: {
  profile: ProfileLite
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt={profile.display_name} className="w-9 h-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 text-sm font-semibold flex items-center justify-center shrink-0">
          {getInitials(profile.display_name)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <Link
          href={`/people/${profile.handle}`}
          className="text-sm font-medium text-gray-900 dark:text-gray-50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate block"
        >
          {profile.display_name}
        </Link>
        <p className="text-xs text-gray-400 truncate">@{profile.handle}</p>
      </div>
      {children}
    </div>
  )
}
