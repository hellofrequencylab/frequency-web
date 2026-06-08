import { Sparkles } from 'lucide-react'
import { listCollaborators } from '@/lib/partners/collaborators'
import { IndexTemplate } from '@/components/templates'
import { PersonCard } from '@/components/cards/person-card'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

// Collaborator featured directory — teachers, authors, and creators in the Collaborator
// program, with the Journeys they've authored. Members browse and adopt their paths.
export default async function CollaboratorsPage() {
  const collaborators = await listCollaborators()

  return (
    <IndexTemplate
      title="Collaborators"
      description="Teachers, authors, and creators sharing their Practices and Journeys with the community. Follow their work and adopt a path."
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
                c.journeyCount > 0 ? (
                  <span>{c.journeyCount} {c.journeyCount === 1 ? 'Journey' : 'Journeys'}</span>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </IndexTemplate>
  )
}
