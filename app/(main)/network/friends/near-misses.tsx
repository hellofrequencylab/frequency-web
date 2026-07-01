import { PersonCard } from '@/components/cards/person-card'
import { SectionHeader } from '@/components/ui/section-header'
import type { NearMiss } from '@/lib/connections/resonance'
import { ConnectButton } from './friend-row-actions'

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'

// A warm, human overlap line — "you keep ending up in the same rooms", never a
// resonance number (those stay private to each viewer, ADR-186).
function overlapContext(m: NearMiss): string {
  const bits: string[] = []
  if (m.sharedCircles > 0) bits.push(`${m.sharedCircles} shared circle${m.sharedCircles === 1 ? '' : 's'}`)
  if (m.coEvents > 0) bits.push(`${m.coEvents} event${m.coEvents === 1 ? '' : 's'} in common`)
  return bits.join(' · ')
}

/** "People you keep crossing paths with" — the serendipity-closing section. Each
 *  near-miss carries its overlap context and a Connect button that sends a friend
 *  request. Rendered only when the platform's near-miss toggle is on. */
export function NearMissesSection({ people }: { people: NearMiss[] }) {
  if (people.length === 0) return null
  return (
    <section>
      <SectionHeader title="People you keep crossing paths with" count={people.length} />
      <p className="mb-3 -mt-1 max-w-prose text-sm text-muted">
        You haven&rsquo;t connected yet, but your worlds already overlap. Say hello.
      </p>
      <div className={GRID}>
        {people.map((m) => (
          <PersonCard
            key={m.profileId}
            handle={m.handle}
            displayName={m.displayName}
            avatarUrl={m.avatarUrl}
            context={overlapContext(m) || `@${m.handle}`}
            action={<ConnectButton targetId={m.profileId} />}
          />
        ))}
      </div>
    </section>
  )
}
