import Link from 'next/link'
import { Map } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMyPlans } from '@/lib/journey-plans'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { PlanCard } from '@/components/journeys/plan-card'

// Journeys layout module (ADR-270/294): the viewer's own journeys (kept + built). Self-fetching
// RSC keyed to the signed-in member; renders nothing when there is no viewer.
export async function JourneysMine() {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const mine = await getMyPlans(profileId)

  return (
    <section>
      {/* The header links to the full management space (store / edit / publish / duplicate / delete). */}
      <SectionHeader title="Your journeys" count={mine.length} href="/journeys/mine" />
      {mine.length === 0 ? (
        <EmptyState icon={Map} title="No journeys yet" description="Hit “New journey” to open the builder and lay out your path." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
            {mine.slice(0, 4).map((p) => (
              <PlanCard key={p.id} plan={p} mine />
            ))}
          </div>
          <Link href="/journeys/mine" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-strong hover:underline">
            Manage all your journeys{mine.length > 4 ? ` (${mine.length})` : ''} →
          </Link>
        </>
      )}
    </section>
  )
}
