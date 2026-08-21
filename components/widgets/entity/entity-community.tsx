import { Users } from 'lucide-react'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { getMyProfileId } from '@/lib/auth'
import { listPublicSpaceCircles } from '@/lib/circles/store'
import { SectionHeader } from '@/components/ui/section-header'
import { EntityCard } from '@/components/cards/entity-card'
import { EntitySectionEmpty } from '@/components/widgets/entity/entity-empty'

// ENTITY MODULE — Community (ENTITY-SPACES-BUILD §B.2, row `entity-community`). A self-fetching
// RSC: reads the active Space, lists its OWN Circles (space_id-filtered + fail-safe), and renders
// them as an `EntityCard` grid. Empty → `EmptyState`. NULL only when there's no active Space.
//
// COPY: "Circles" is the canon name (NAMING — Circle > Hub > Nexus); the empty names the
// situation + the next step plainly; no em/en dashes.
export async function EntityCommunity() {
  const space = getActiveSpace()
  if (!space) return null

  // The PUBLIC reader (ADR-1094): active + axis 1, both applied in the query so a hidden circle
  // cannot eat a slot in the six. This module used to filter on status alone and listed every
  // unlisted circle a Space owned to any visitor.
  const circles = await listPublicSpaceCircles(space.id, { viewerProfileId: await getMyProfileId(), limit: 6 })

  return (
    <div>
      <SectionHeader title="Circles" count={circles.length || undefined} />
      {circles.length === 0 ? (
        <EntitySectionEmpty
          icon={Users}
          title="No circles yet."
          description="Circles this space runs show up here to join."
          ownerTitle="No circles yet."
          ownerActionLabel="Start your first circle"
        />
      ) : (
        <div className="grid gap-4 @lg:grid-cols-2">
          {circles.map((c) => (
            <EntityCard
              key={c.id}
              href={`/circles/${c.slug}`}
              title={c.name}
              description={c.about ?? undefined}
              meta={
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {(c.member_count ?? 0).toLocaleString()} {c.member_count === 1 ? 'member' : 'members'}
                </span>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
