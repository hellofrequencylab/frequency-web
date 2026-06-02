import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UserPlus, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getInitials } from '@/lib/utils'
import { bucketFriendships, type FriendshipRpcRow, type FriendEntry } from '@/lib/friendships-map'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ModuleCard } from '@/components/modules/module-card'
import {
  AcceptDeclineButtons,
  CancelOutgoingButton,
  UnfriendButton,
} from './friend-row-actions'

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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-8">
          {incoming.length > 0 && (
            <section>
              <SectionHeader title="Incoming requests" count={incoming.length} />
              <div className="space-y-2">
                {incoming.map((e) => (
                  <FriendRow key={e.id} profile={e.other}>
                    <AcceptDeclineButtons requesterId={e.other.id} />
                  </FriendRow>
                ))}
              </div>
            </section>
          )}

          {outgoing.length > 0 && (
            <section>
              <SectionHeader title="Outgoing requests" count={outgoing.length} />
              <div className="space-y-2">
                {outgoing.map((e) => (
                  <FriendRow key={e.id} profile={e.other}>
                    <CancelOutgoingButton addresseeId={e.other.id} />
                  </FriendRow>
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
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Find people
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2">
                {accepted.map((e) => (
                  <FriendRow key={e.id} profile={e.other}>
                    <UnfriendButton otherId={e.other.id} />
                  </FriendRow>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Context — borderless module (the global rail carries the rest). */}
        <div className="space-y-4">
          <ModuleCard title="About friends">
            <p className="text-sm leading-relaxed text-muted">
              You must be friends to start a 1:1 DM or a group DM. Send a request from anyone’s
              profile. Existing conversations stay accessible to their members regardless of
              friendship status.
            </p>
          </ModuleCard>
        </div>
      </div>
    </IndexTemplate>
  )
}

function FriendRow({
  profile,
  children,
}: {
  profile: FriendEntry['other']
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      {profile.avatar_url ? (
        <Image src={profile.avatar_url} alt={profile.display_name} width={36} height={36} className="w-9 h-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-primary-bg text-primary-strong text-sm font-semibold flex items-center justify-center shrink-0">
          {getInitials(profile.display_name)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <Link
          href={`/people/${profile.handle}`}
          className="text-sm font-medium text-text hover:text-primary-strong transition-colors truncate block"
        >
          {profile.display_name}
        </Link>
        <p className="text-xs text-subtle truncate">@{profile.handle}</p>
      </div>
      {children}
    </div>
  )
}
