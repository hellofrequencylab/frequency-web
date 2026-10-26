import { Users } from 'lucide-react'
import Link from 'next/link'
import { PersonCard } from '@/components/cards/person-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import {
  ORBIT_LABEL,
  resonanceContext,
  type Orbit,
  type OrbitMember,
} from '@/lib/connections/resonance'
import { UnfriendButton, ReconnectButton } from './friend-row-actions'

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
const ORBIT_ORDER: Orbit[] = ['inner', 'middle', 'outer']

// A private, viewer-only chip — the orbit label is *your* read on the relationship,
// never a public ranking (ADR-186). No number is ever shown.
function OrbitChip({ orbit }: { orbit: Orbit }) {
  return <span className="tag">{ORBIT_LABEL[orbit]}</span>
}

function OrbitCard({ member }: { member: OrbitMember }) {
  const context = resonanceContext(member)
  // Outer-orbit friends get a gentle reconnect door instead of the unfriend control —
  // framed as gardening, never guilt.
  const action =
    member.orbit === 'outer' ? (
      <ReconnectButton handle={member.handle} />
    ) : (
      <UnfriendButton otherId={member.profileId} />
    )
  return (
    <PersonCard
      handle={member.handle}
      displayName={member.displayName}
      avatarUrl={member.avatarUrl}
      context={context || `@${member.handle}`}
      meta={
        <>
          <OrbitChip orbit={member.orbit} />
          {member.orbit === 'outer' && (
            <span className="text-subtle">You&rsquo;ve drifted. Say hi</span>
          )}
        </>
      }
      action={action}
    />
  )
}

function emptyFriends() {
  return (
    <EmptyState
      icon={Users}
      title="No friends yet"
      description="Add a few people and they’ll show up here. Then you can start a DM or group thread."
      action={
        <Link
          href="/people"
          className={
            buttonClasses('primary', 'md')
          }
        >
          Find people
        </Link>
      }
    />
  )
}

/** Accepted friends grouped by orbit (inner → middle → outer), with a private orbit
 *  chip + shared-context line per card. Shown when resonance is enabled. */
export function OrbitGroups({ members }: { members: OrbitMember[] }) {
  if (members.length === 0) return emptyFriends()
  return (
    <div className="space-y-8">
      {ORBIT_ORDER.map((orbit) => {
        const group = members.filter((m) => m.orbit === orbit)
        if (group.length === 0) return null
        return (
          <section key={orbit}>
            <SectionHeader title={ORBIT_LABEL[orbit]} count={group.length} />
            <div className={GRID}>
              {group.map((m) => (
                <OrbitCard key={m.profileId} member={m} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Plain alphabetical friends list — the graceful fallback when the platform's
 *  resonance toggle is OFF (no orbits, no chips, no reconnect nudges). */
export function PlainFriendList({ members }: { members: OrbitMember[] }) {
  if (members.length === 0) return emptyFriends()
  const sorted = [...members].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  )
  return (
    <section>
      <SectionHeader title="Friends" count={sorted.length} />
      <div className={GRID}>
        {sorted.map((m) => (
          <PersonCard
            key={m.profileId}
            handle={m.handle}
            displayName={m.displayName}
            avatarUrl={m.avatarUrl}
            action={<UnfriendButton otherId={m.profileId} />}
          />
        ))}
      </div>
    </section>
  )
}
