import { ModuleCard } from '@/components/modules/module-card'
import { CircleMembersList } from '@/components/circles/circle-members-list'
import { getCircleContext } from '@/lib/circles/active-circle'

export const CircleMembers = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle, members, myProfileId, isMember } = ctx

  return (
    <ModuleCard title="Members" badge={String(members.length)}>
      <CircleMembersList members={members} hostId={circle.host?.id ?? null} myProfileId={myProfileId} isMember={isMember} />
    </ModuleCard>
  )
}
