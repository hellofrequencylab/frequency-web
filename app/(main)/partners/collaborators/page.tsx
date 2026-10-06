import Link from 'next/link'
import { Leaf, Route, Sparkles } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { listCollaborators } from '@/lib/partners/collaborators'
import { IndexTemplate } from '@/components/templates'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { PersonCard } from '@/components/cards/person-card'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

// Collaborator featured directory — teachers, authors, and creators in the Collaborator program
// or with featured work, each with what they made and a link to it (LIVE-708). Members browse and
// adopt their paths; an author opens their own Earnings from the header.
export default async function CollaboratorsPage() {
  const collaborators = await listCollaborators()

  const hero = await resolveIndexHero('/partners/collaborators')

  return (
    <IndexTemplate
      {...hero}
      title="Collaborators"
      description="Teachers, authors, and creators sharing their Practices and Journeys with the community. Follow their work and adopt a path."
      action={
        <Link href="/partners/collaborators/earnings" className={buttonClasses('secondary', 'sm')}>
          Your Journey earnings
        </Link>
      }
    >
      {collaborators.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No collaborators yet"
          description="Creators who join the Collaborator program show up here with their featured Practices & Journeys."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collaborators.map((c) => (
            <PersonCard
              key={c.id}
              handle={c.handle}
              displayName={c.displayName}
              avatarUrl={c.avatarUrl}
              context="Collaborator"
              meta={
                c.journeyCount + c.practiceCount > 0 ? (
                  <span>{workCount(c.journeyCount, c.practiceCount)}</span>
                ) : undefined
              }
              footer={
                c.work.length > 0 ? (
                  <ul className="space-y-1">
                    {c.work.map((w) => (
                      <li key={w.href} className="flex items-center gap-1.5 text-meta">
                        {w.kind === 'journey' ? (
                          <Route className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                        ) : (
                          <Leaf className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                        )}
                        <Link href={w.href} className="truncate font-medium text-text hover:text-primary-strong">
                          {w.title}
                        </Link>
                        {w.featured && <span className="shrink-0 text-subtle">Featured</span>}
                      </li>
                    ))}
                  </ul>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </IndexTemplate>
  )
}

function workCount(journeys: number, practices: number): string {
  const parts = [
    journeys > 0 ? `${journeys} ${journeys === 1 ? 'Journey' : 'Journeys'}` : '',
    practices > 0 ? `${practices} ${practices === 1 ? 'Practice' : 'Practices'}` : '',
  ].filter(Boolean)
  return parts.join(', ')
}
