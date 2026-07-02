import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { getDeal, getStages, getActivities } from '@/lib/crm/pipeline'
import { DealDetail } from './deal-detail'

export const dynamic = 'force-dynamic'

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Staff axis (web_role janitor, ADR-208), matching the deals board and the rest of the CRM
  // domain. The old atLeastRole(community_role, 'host') gate locked Executive Admins out of
  // deal detail (web_role=janitor, community_role=member).
  await requireAdmin('janitor')

  const [deal, stages, activities] = await Promise.all([getDeal(id), getStages(), getActivities(id)])
  if (!deal) notFound()

  return <DealDetail deal={deal} stages={stages} activities={activities} />
}
