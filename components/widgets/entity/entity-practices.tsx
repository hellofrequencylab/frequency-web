import { Sparkles, Route } from 'lucide-react'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { listPracticesForSpace } from '@/lib/practices'
import { listJourneyPlansForSpace } from '@/lib/journey-plans'
import { SectionHeader } from '@/components/ui/section-header'
import { EntityCard } from '@/components/cards/entity-card'
import { EntitySectionEmpty } from '@/components/widgets/entity/entity-empty'

// ENTITY MODULE — Practices & Journeys (ENTITY-SPACES-BUILD §B.2, rows `entity-practices` +
// `entity-journeys`, folded into one tab module for Practitioner §B.3). A self-fetching RSC: reads
// the active Space, lists its OWN Practices and Journeys (both space_id-filtered + fail-safe), and
// renders each as an `EntityCard` grid. Each section drops to `EmptyState` when empty; the whole
// module returns NULL only when there's no active Space.
//
// COPY: "Practices to start" / "Journeys to begin" are plain imperatives; emptys name the
// situation + next step; no em/en dashes, no narrated feelings.
export async function EntityPractices() {
  const space = getActiveSpace()
  if (!space) return null

  const [practices, journeys] = await Promise.all([
    listPracticesForSpace(space.id, 6),
    listJourneyPlansForSpace(space.id, 6),
  ])

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader title="Practices to start" count={practices.length || undefined} />
        {practices.length === 0 ? (
          <EntitySectionEmpty
            icon={Sparkles}
            title="No practices shared yet."
            description="Practices this space publishes show up here to try."
            ownerTitle="No practices shared yet."
            ownerActionLabel="Share your first practice"
          />
        ) : (
          <div className="grid gap-4 @lg:grid-cols-2">
            {practices.map((p) => (
              <EntityCard
                key={p.id}
                href={p.slug ? `/practices/${p.slug}` : `/practices/${p.id}`}
                title={p.title}
                description={p.summary ?? p.description ?? undefined}
                anchor={
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-bg text-lg" aria-hidden>
                    {p.icon ?? '🌀'}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeader title="Journeys to begin" count={journeys.length || undefined} />
        {journeys.length === 0 ? (
          <EntitySectionEmpty
            icon={Route}
            title="No journeys shared yet."
            description="Multi-week Journeys this space builds show up here to adopt."
            ownerTitle="No journeys built yet."
            ownerActionLabel="Build your first Journey"
          />
        ) : (
          <div className="grid gap-4 @lg:grid-cols-2">
            {journeys.map((j) => (
              <EntityCard
                key={j.id}
                href={`/journeys/${j.slug}`}
                title={j.title}
                description={j.summary ?? undefined}
                anchor={
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-bg text-lg" aria-hidden>
                    {j.emoji ?? '🧭'}
                  </span>
                }
                meta={j.adopt_count > 0 ? <span>{j.adopt_count.toLocaleString()} adopted</span> : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
