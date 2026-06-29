import { ModuleCard } from '@/components/modules/module-card'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { getCircleContext } from '@/lib/circles/active-circle'

export const CirclePracticeBlock = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle, circlePractice, canManage, isMember } = ctx

  if (!circlePractice && !canManage) return null
  return (
    <ModuleCard title="This week's practice">
      {circlePractice ? (
        <>
          <p className="font-medium text-text">{circlePractice.title}</p>
          {circlePractice.description && <p className="mt-0.5 text-sm text-muted">{circlePractice.description}</p>}
          {isMember && (
            <div className="mt-3">
              <LogPracticeButton practiceId={circlePractice.id} circleId={circle.id} />
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">No practice set yet.</p>
      )}
    </ModuleCard>
  )
}
