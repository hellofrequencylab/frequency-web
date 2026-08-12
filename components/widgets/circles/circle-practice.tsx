import { ModuleCard } from '@/components/modules/module-card'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { getCircleContext } from '@/lib/circles/active-circle'

// The "This week's practice" block. It renders ONLY when a host has set one: a rail module that
// draws an empty "none yet" box teaches the eye that the whole column is skippable, and takes the
// boxes that DO have something down with it. There is no manager fallback here any more, because
// the manager already has the picker where the write belongs: the admin rail's Engage module
// (components/admin/modules/circle-practice-module.tsx).
export const CirclePracticeBlock = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle, circlePractice, isMember } = ctx

  if (!circlePractice) return null
  return (
    <ModuleCard title="This week's practice">
      <p className="font-medium text-text">{circlePractice.title}</p>
      {circlePractice.description && <p className="mt-0.5 text-body-sm text-muted">{circlePractice.description}</p>}
      {isMember && (
        <div className="mt-3">
          <LogPracticeButton practiceId={circlePractice.id} circleId={circle.id} />
        </div>
      )}
    </ModuleCard>
  )
}
