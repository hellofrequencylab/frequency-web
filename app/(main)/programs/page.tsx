import type { Metadata } from 'next'
import { BookOpen, Check } from 'lucide-react'
import { listPrograms, getCompletedProgramSlugs } from '@/lib/programs'
import { getMyProfileId } from '@/lib/auth'
import { IndexTemplate } from '@/components/templates/index-template'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata: Metadata = {
  title: 'Programs',
  description: 'Free frameworks and trainings for starting, running, and growing a circle.',
}

export default async function ProgramsPage() {
  const profileId = await getMyProfileId()
  const [programs, completed] = await Promise.all([
    listPrograms(),
    profileId ? getCompletedProgramSlugs(profileId) : Promise.resolve(new Set<string>()),
  ])

  return (
    <IndexTemplate
      title="Programs"
      description="Free frameworks and trainings to help you start, run, and grow a real circle. None of it is appointed from above; this is how to do it yourself."
    >
      {programs.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Programs are coming soon"
          description="Frameworks for starting, running, and growing a circle are on the way. Check back soon."
        />
      ) : (
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
      )}
    </IndexTemplate>
  )
}
