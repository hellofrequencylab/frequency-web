import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { FocusTemplate } from '@/components/templates'
import { getStages, getDeal } from '@/lib/crm/pipeline'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { DealForm } from '@/components/crm/deal-form'

export const dynamic = 'force-dynamic'

export default async function EditPipelineCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Same janitor gate as the board and detail pages: the /admin layout only enforces the
  // community-host floor, and getDeal reads via the service-role client — without this a
  // non-staff host could read a deal's title, contact, value and notes straight off the form.
  await requireAdmin('janitor')
  const rootId = (await loadRootSpaceId()) ?? undefined
  const [stages, deal] = await Promise.all([getStages(rootId), getDeal(id, rootId)])
  if (!deal) notFound()
  return (
    <FocusTemplate title="Edit card" description="Update this card or move its stage.">
      <DealForm stages={stages} deal={deal} />
    </FocusTemplate>
  )
}
