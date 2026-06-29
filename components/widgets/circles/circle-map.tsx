import { Suspense } from 'react'
import { GroupMapSection } from '@/components/connections/group-map-section'
import { getCircleContext } from '@/lib/circles/active-circle'

export const CircleMapBlock = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle } = ctx

  return (
    <Suspense fallback={null}>
      <GroupMapSection circle={{ id: circle.id, name: circle.name, latitude: circle.latitude, longitude: circle.longitude, neighborhood: circle.neighborhood, city: circle.city }} />
    </Suspense>
  )
}
