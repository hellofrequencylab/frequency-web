import { FocusTemplate } from '@/components/templates'
import { getStages } from '@/lib/crm/pipeline'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { DealForm } from '@/components/crm/deal-form'

export const dynamic = 'force-dynamic'

export default async function NewPipelineCardPage() {
  const rootId = (await loadRootSpaceId()) ?? undefined
  const stages = await getStages(rootId)
  return (
    <FocusTemplate title="New card" description="Start an upsell or log a donation ask.">
      <DealForm stages={stages} />
    </FocusTemplate>
  )
}
