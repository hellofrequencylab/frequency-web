import { ModuleCard } from '@/components/modules/module-card'
import { UpcomingEventsWidget } from '@/components/events/upcoming-widget'
import { getCircleContext } from '@/lib/circles/active-circle'

export const CircleEvents = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle } = ctx

  return (
    <ModuleCard title="Upcoming events">
      <UpcomingEventsWidget scopeIds={[circle.id]} />
    </ModuleCard>
  )
}
