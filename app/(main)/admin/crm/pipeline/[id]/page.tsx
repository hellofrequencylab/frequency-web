import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { getDeal, getStages, getActivities } from '@/lib/crm/pipeline'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { DealDetail } from './deal-detail'

export const dynamic = 'force-dynamic'

export default async function PipelineCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Staff axis (web_role janitor, ADR-208), matching the board and the rest of the CRM domain. The
  // platform Pipeline reads scope to the root Space so a card, its stages, and its activity all resolve
  // from the same tenant the board shows.
  await requireAdmin('janitor')

  const rootId = (await loadRootSpaceId()) ?? undefined
  const [deal, stages, activities] = await Promise.all([getDeal(id, rootId), getStages(rootId), getActivities(id, rootId)])
  if (!deal) notFound()

  return <DealDetail deal={deal} stages={stages} activities={activities} />
}
