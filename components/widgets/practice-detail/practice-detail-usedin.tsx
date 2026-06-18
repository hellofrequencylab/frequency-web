import { Suspense } from 'react'
import { getDetailPractice } from '@/lib/practices/detail-data'
import { UsedInSection, UsedInSkeleton } from '@/components/practices/used-in-section'

// Practice-detail layout module: "Used in" — the journeys + circles running this practice. Renders
// nothing when both lists are empty (visibility enforced in getPracticeBacklinks).
export async function PracticeDetailUsedIn() {
  const practice = await getDetailPractice()
  if (!practice) return null
  return (
    <Suspense fallback={<UsedInSkeleton />}>
      <UsedInSection practiceId={practice.id} />
    </Suspense>
  )
}
