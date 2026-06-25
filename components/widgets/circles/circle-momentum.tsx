import { Suspense } from 'react'
import { CircleMomentum as CircleMomentumWidget } from '@/components/connections/circle-momentum'
import { getCircleContext } from '@/lib/circles/active-circle'

export const CircleMomentumBlock = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle } = ctx

  return (
    <Suspense fallback={null}>
      <CircleMomentumWidget circleId={circle.id} />
    </Suspense>
  )
}
