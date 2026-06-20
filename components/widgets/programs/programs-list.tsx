import { BookOpen, Check } from 'lucide-react'
import { listPrograms, getCompletedProgramSlugs } from '@/lib/programs'
import { getMyProfileId } from '@/lib/auth'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'

// Programs layout module (ADR-270/294): the open browse list of the Foundation's frameworks and
// trainings (start, run, grow a circle), each card showing the viewer's own completion check. A
// self-fetching RSC: it reads the Markdown library (lib/programs) and the viewer's completed slugs,
// keyed only on the viewer, so it is a clean standalone block with no searchParams facet. The
// "coming soon" empty state is intentionally part of the block, so an operator who places it always
// shows a member something, never a blank surface (the module contract).
export async function ProgramsList() {
  const profileId = await getMyProfileId()
  const [programs, completed] = await Promise.all([
    listPrograms(),
    profileId ? getCompletedProgramSlugs(profileId) : Promise.resolve(new Set<string>()),
  ])

  if (programs.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Programs are coming soon"
        description="Frameworks for starting, running, and growing a circle are on the way. Check back soon."
      />
    )
  }

  return (
    <div className="grid max-w-2xl grid-cols-1 gap-3">
      {programs.map((p) => (
        <EntityCard
          key={p.slug}
          href={`/programs/${p.slug}`}
          anchor={
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
              <BookOpen className="h-5 w-5" />
            </div>
          }
          title={
            <span className="inline-flex items-center gap-1.5">
              {p.title}
              {completed.has(p.slug) && (
                <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-label="Completed" />
              )}
            </span>
          }
          context={p.audience === 'host' ? 'For hosts' : 'For everyone'}
          description={p.description ?? undefined}
          meta={p.duration ? <span>{p.duration}</span> : undefined}
        />
      ))}
    </div>
  )
}
