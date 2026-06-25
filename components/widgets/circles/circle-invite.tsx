import { ModuleCard } from '@/components/modules/module-card'
import { HostInviteButton } from '@/components/circles/host-invite-button'
import { HostInviteEmail } from '@/components/circles/host-invite-email'
import { getCircleContext } from '@/lib/circles/active-circle'

export const CircleInvite = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle, canManage } = ctx

  if (!canManage) return null
  return (
    <ModuleCard title="Invite a friend">
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Bring someone into {circle.name}. (Edit the circle itself from{' '}
        <span className="font-medium text-text">Settings</span> at the top.)
      </p>
      <HostInviteButton circleId={circle.id} />
      <div className="mt-2">
        <HostInviteEmail circleId={circle.id} />
      </div>
    </ModuleCard>
  )
}
