import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UserPlus, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { bucketFriendships, type FriendshipRpcRow, type FriendEntry } from '@/lib/friendships-map'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { PersonCard } from '@/components/cards/person-card'
import {
  AcceptDeclineButtons,
  CancelOutgoingButton,
  UnfriendButton,
} from './friend-row-actions'

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'

function FriendCard({ profile, action }: { profile: FriendEntry['other']; action: React.ReactNode }) {
  return (
    <PersonCard
      handle={profile.handle}
      displayName={profile.display_name}
      avatarUrl={profile.avatar_url}
      action={action}
    />
  )
}

export default async function FriendsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // RLS convergence (migration 20240308000000): own friendships + the other
  // party's public fields via the user-scoped client through a DEFINER RPC.
  const { data } = await (supabase as unknown as SupabaseClient).rpc('my_friendships')
  const { incoming, outgoing, accepted } = bucketFriendships(
    (data as FriendshipRpcRow[] | null) ?? [],
  )

  return (
    <IndexTemplate
      title="Friends"
      description="Your friends and any pending requests live here. Add someone before you start a direct message or group thread with them."
    >
      <div className="space-y-8">
        {incoming.length > 0 && (
          <section>
            <SectionHeader title="Incoming requests" count={incoming.length} />
            <div className={GRID}>
              {incoming.map((e) => (
                <FriendCard key={e.id} profile={e.other} action={<AcceptDeclineButtons requesterId={e.other.id} />} />
              ))}
            </div>
          </section>
        )}

        {outgoing.length > 0 && (
          <section>
            <SectionHeader title="Outgoing requests" count={outgoing.length} />
            <div className={GRID}>
              {outgoing.map((e) => (
                <FriendCard key={e.id} profile={e.other} action={<CancelOutgoingButton addresseeId={e.other.id} />} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeader title="Friends" count={accepted.length} />
          {accepted.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No friends yet"
              description="Add a few people and they’ll show up here — then you can start a DM or group thread."
              action={
                <Link
                  href="/people"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
                >
                  <UserPlus className="h-4 w-4" />
                  Find people
                </Link>
              }
            />
          ) : (
            <div className={GRID}>
              {accepted.map((e) => (
                <FriendCard key={e.id} profile={e.other} action={<UnfriendButton otherId={e.other.id} />} />
              ))}
            </div>
          )}
        </section>
      </div>
    </IndexTemplate>
  )
}
