import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getStages, getDeal } from '@/lib/crm/pipeline'
import { DealForm } from '@/components/crm/deal-form'

export const dynamic = 'force-dynamic'

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [stages, deal] = await Promise.all([getStages(), getDeal(id)])
  if (!deal) notFound()
  return (
    <FocusTemplate title="Edit deal" description="Update this deal or move its stage.">
      <DealForm stages={stages} deal={deal} />
    </FocusTemplate>
  )
}
