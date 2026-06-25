import { ModuleCard } from '@/components/modules/module-card'
import { StartRunButton } from '@/components/journey/v2/start-run-button'
import { getCircleContext } from '@/lib/circles/active-circle'

export const CircleJourneyRun = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle, canManage, runnableJourneys } = ctx

  if (!canManage) return null
  return (
    <ModuleCard title="Start a journey run">
      <StartRunButton circleId={circle.id} journeys={runnableJourneys} />
    </ModuleCard>
  )
}
