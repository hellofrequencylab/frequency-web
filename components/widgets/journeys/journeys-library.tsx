import { Users } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { listPublicPlans } from '@/lib/journey-plans'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { PlanCard } from '@/components/journeys/plan-card'

// Journeys layout module (ADR-270/294): the open community library — every public Journey except
// the viewer's own. Self-fetching RSC; public data, so it renders for signed-out visitors too.
export async function JourneysLibrary() {
  const [profileId, library] = await Promise.all([getMyProfileId(), listPublicPlans()])
  const community = library.filter((p) => p.author_id !== profileId)

  return (
    <section>
      <SectionHeader title="Community library" count={community.length} />
      {community.length === 0 ? (
        <EmptyState icon={Users} title="The library is just getting started" description="Build a journey and share it to be the first in the library." />
      ) : (
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
          {community.map((p) => (
            <PlanCard key={p.id} plan={p} mine={false} />
          ))}
        </div>
      )}
    </section>
  )
}
