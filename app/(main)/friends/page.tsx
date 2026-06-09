import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { bucketFriendships, type FriendshipRpcRow, type FriendEntry } from '@/lib/friendships-map'
import { getMyOrbit, getNearMisses } from '@/lib/connections/resonance'
import { getConnectionSettings } from '@/lib/connections/connection-settings'
import { contactsOwnerId } from '@/lib/connections/access'
import { listContacts } from '@/lib/connections/store'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { PersonCard } from '@/components/cards/person-card'
import { InviteButton } from '@/components/invite/invite-button'
import { ModeSwitch, type FriendsMode } from './mode-switch'
import { OrbitGroups, PlainFriendList } from './orbit-list'
import { NearMissesSection } from './near-misses'
import { ContactsList } from './contacts-list'
import { AcceptDeclineButtons, CancelOutgoingButton } from './friend-row-actions'

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'

function PendingCard({ profile, action }: { profile: FriendEntry['other']; action: React.ReactNode }) {
  return (
    <PersonCard
      handle={profile.handle}
      displayName={profile.display_name}
      avatarUrl={profile.avatar_url}
      action={action}
    />
  )
}

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const { mode: rawMode } = await searchParams
  const mode: FriendsMode = rawMode === 'contacts' ? 'contacts' : 'people'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // Pending request buckets always come from my_friendships (incoming/outgoing live
  // outside the orbit, which only returns ACCEPTED friends).
  const { data } = await (supabase as unknown as SupabaseClient).rpc('my_friendships')
  const { incoming, outgoing, accepted } = bucketFriendships(
    (data as FriendshipRpcRow[] | null) ?? [],
  )

  // Contact count for the mode switch (cheap-ish; cached owner resolution).
  const ownerId = await contactsOwnerId()
  const contacts = mode === 'contacts' && ownerId ? await listContacts(ownerId) : []

  return (
    <div className="mx-auto max-w-5xl">
      <IndexTemplate
        title="Friends"
        description="Your people and your contacts in one place — connections you’ve made, and the rolodex of everyone you’ve met."
        action={
          mode === 'contacts' ? (
            <Link
              href="/connections/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> Capture
            </Link>
          ) : (
            <InviteButton label="Invite friends · earn zaps" />
          )
        }
        toolbar={<ModeSwitch mode={mode} />}
      >
        {mode === 'contacts' ? (
          <ContactsList contacts={contacts} />
        ) : (
          <PeopleMode incoming={incoming} outgoing={outgoing} accepted={accepted} />
        )}
      </IndexTemplate>
    </div>
  )
}

async function PeopleMode({
  incoming,
  outgoing,
  accepted,
}: {
  incoming: FriendEntry[]
  outgoing: FriendEntry[]
  accepted: FriendEntry[]
}) {
  const settings = await getConnectionSettings()

  // The orbit (co-presence-weighted, ACCEPTED only) drives the friends list when
  // resonance is on; otherwise we fall back to the plain my_friendships list so the
  // surface never depends on a disabled feature.
  const [orbit, nearMisses] = await Promise.all([
    settings.resonanceEnabled ? getMyOrbit() : Promise.resolve([]),
    settings.nearMissEnabled ? getNearMisses() : Promise.resolve([]),
  ])

  return (
    <div className="space-y-8">
      {incoming.length > 0 && (
        <section>
          <SectionHeader title="Incoming requests" count={incoming.length} />
          <div className={GRID}>
            {incoming.map((e) => (
              <PendingCard key={e.id} profile={e.other} action={<AcceptDeclineButtons requesterId={e.other.id} />} />
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <SectionHeader title="Outgoing requests" count={outgoing.length} />
          <div className={GRID}>
            {outgoing.map((e) => (
              <PendingCard key={e.id} profile={e.other} action={<CancelOutgoingButton addresseeId={e.other.id} />} />
            ))}
          </div>
        </section>
      )}

      {settings.resonanceEnabled ? (
        <OrbitGroups members={orbit} />
      ) : (
        // Resonance off → degrade to a plain alphabetical friends list built from
        // the my_friendships buckets (no orbit RPC, no chips, no reconnect nudges).
        <PlainFriendList
          members={accepted.map((e) => ({
            profileId: e.other.id,
            displayName: e.other.display_name,
            handle: e.other.handle,
            avatarUrl: e.other.avatar_url,
            howMet: 'unknown' as const,
            metAt: null,
            sharedCircles: 0,
            coEvents: 0,
            lastTogether: null,
            resonance: 0,
            orbit: 'outer' as const,
          }))}
        />
      )}

      {settings.nearMissEnabled && <NearMissesSection people={nearMisses} />}
    </div>
  )
}
