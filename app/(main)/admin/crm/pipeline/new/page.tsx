import { requireAdmin } from '@/lib/admin/guard'
import { FocusTemplate } from '@/components/templates'
import { getStages } from '@/lib/crm/pipeline'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { DealForm } from '@/components/crm/deal-form'

export const dynamic = 'force-dynamic'

export default async function NewPipelineCardPage() {
  // Same janitor gate as the board and detail pages: the /admin layout only enforces the
  // community-host floor, and getStages reads via the service-role client, so without this
  // a non-staff host could open the form (the write half re-gates, but the read is the leak).
  await requireAdmin('janitor')
  const rootId = (await loadRootSpaceId()) ?? undefined
  const stages = await getStages(rootId)
  return (
    <FocusTemplate title="New card" description="Start an upsell or log a donation ask.">
      <DealForm stages={stages} />
    </FocusTemplate>
  )
}
