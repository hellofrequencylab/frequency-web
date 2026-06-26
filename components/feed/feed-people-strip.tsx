import { UserPlus } from 'lucide-react'
import Link from 'next/link'
import { PersonCard } from '@/components/cards/person-card'
import { getFeedPeopleSuggestions } from '@/lib/feed/feed-people'
import { suggestionReason } from '@/lib/people-suggestions'

// "People you'd click with" — a quiet in-feed row that introduces the viewer to a
// few members on their wavelength (Resonance Feed Phase 1, ADR-414). It reuses the
// real-signal suggestion engine (shared circles + mutual connections), already
// filtered by the viewer's hide list, and renders the shared PersonCard so a person
// reads identically here and in the directory. Renders NOTHING when there's no
// genuine suggestion, so it never pads the feed with filler. Server Component; the
// feed wraps it in <Suspense> so it never blocks the post stream.
export async function FeedPeopleStrip({ viewerProfileId }: { viewerProfileId: string }) {
  const people = await getFeedPeopleSuggestions(viewerProfileId, 3)
  if (people.length === 0) return null

  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-text">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
            <UserPlus className="h-3.5 w-3.5" />
          </span>
          People you&rsquo;d click with
        </h3>
        <Link href="/network" className="text-xs font-medium text-primary-strong hover:underline">
          See more
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {people.map((p) => (
          <PersonCard
            key={p.id}
            handle={p.handle}
            displayName={p.displayName}
            avatarUrl={p.avatarUrl}
            meta={
              suggestionReason(p) ? (
                <span className="text-2xs text-subtle">{suggestionReason(p)}</span>
              ) : undefined
            }
          />
        ))}
      </div>
    </section>
  )
}
