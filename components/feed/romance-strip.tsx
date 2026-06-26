import { Heart } from 'lucide-react'
import Link from 'next/link'
import { PersonCard } from '@/components/cards/person-card'
import { VerifiedBadge } from '@/components/ui/verified-badge'
import { MeetupSafetyNote } from '@/components/safety/meetup-safety-note'
import { getRomanceMatches } from '@/lib/match/romance'
import { hasAcknowledgedMeetupSafety } from '@/lib/feed/feed-people'
import { suggestionReason } from '@/lib/people-suggestions'

// The romance lane on the feed (Resonance Feed Phase 5, ADR-419). Renders ONLY when the
// viewer turned romance mode on AND there are mutual opt-ins to show, so it is invisible
// to everyone else. Clearly labeled, drawn from people the viewer already shares context
// with, with the meet-safely guidance attached. No swipe mechanics. Server Component;
// the feed wraps it in <Suspense>.
export async function RomanceStrip({ viewerProfileId }: { viewerProfileId: string }) {
  const [lane, safetyAcknowledged] = await Promise.all([
    getRomanceMatches(viewerProfileId, 4),
    hasAcknowledgedMeetupSafety(viewerProfileId),
  ])
  if (!lane.enabled || lane.people.length === 0) return null

  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-text">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
            <Heart className="h-3.5 w-3.5" />
          </span>
          Open to connection
        </h3>
        <Link href="/settings/connections" className="text-xs font-medium text-primary-strong hover:underline">
          Manage
        </Link>
      </div>
      <p className="mb-3 text-xs text-muted">
        People who are also open to more than friendship and share your circles. Only ever shown to others who opted in too.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {lane.people.map((p) => {
          const why = [suggestionReason(p), p.astroReason].filter(Boolean).join(' · ')
          return (
            <PersonCard
              key={p.id}
              handle={p.handle}
              displayName={p.displayName}
              avatarUrl={p.avatarUrl}
              context={
                <span className="inline-flex items-center gap-1">
                  @{p.handle}
                  <VerifiedBadge verified={p.verified} />
                </span>
              }
              meta={why ? <span className="text-2xs text-subtle">{why}</span> : undefined}
            />
          )
        })}
      </div>
      <div className="mt-3">
        <MeetupSafetyNote acknowledged={safetyAcknowledged} />
      </div>
    </section>
  )
}
