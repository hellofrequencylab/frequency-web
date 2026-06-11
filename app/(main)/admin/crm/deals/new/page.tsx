import { FocusTemplate } from '@/components/templates'
import { getStages } from '@/lib/crm/pipeline'
import { DealForm } from '@/components/crm/deal-form'

export const dynamic = 'force-dynamic'

export default async function NewDealPage() {
  const stages = await getStages()
  return (
    <FocusTemplate title="New deal" description="Add a deal to your pipeline.">
      <DealForm stages={stages} />
    </FocusTemplate>
  )
}
