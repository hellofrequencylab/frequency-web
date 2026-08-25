import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { getDeal, getStages, getActivities } from '@/lib/crm/pipeline'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { DealDetail } from './deal-detail'
import { resolveDetailHero } from '@/lib/layout/detail-hero'

export const dynamic = 'force-dynamic'

export default async function PipelineCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Staff axis (web_role janitor, ADR-208), matching the board and the rest of the CRM domain. The
  // platform Pipeline reads scope to the root Space so a card, its stages, and its activity all resolve
  // from the same tenant the board shows.
  await requireAdmin('janitor')

  const rootId = (await loadRootSpaceId()) ?? undefined
  // The standard entity cover (PROG-P5, ADR-1136), resolved here because DealDetail is a client
  // island. /admin/crm is deliberately UNMAPPED (an operator work surface), so this is a no-op
  // until a section row exists.
  const [deal, stages, activities, hero] = await Promise.all([
    getDeal(id, rootId),
    getStages(rootId),
    getActivities(id, rootId),
    resolveDetailHero(`/admin/crm/pipeline/${id}`),
  ])
  if (!deal) notFound()

  return <DealDetail deal={deal} stages={stages} activities={activities} hero={hero} />
}
