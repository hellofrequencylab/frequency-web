import { redirect, notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getDeal, getStages, getActivities } from '@/lib/crm/pipeline'
import { DealDetail } from './deal-detail'

export const dynamic = 'force-dynamic'

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'host')) redirect('/feed')

  const [deal, stages, activities] = await Promise.all([getDeal(id), getStages(), getActivities(id)])
  if (!deal) notFound()

  return <DealDetail deal={deal} stages={stages} activities={activities} />
}
