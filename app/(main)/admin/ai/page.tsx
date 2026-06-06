import { Power } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { getAiControlsData } from './load-ai'
import { AiControlsView } from './ai-controls-view'

export const dynamic = 'force-dynamic'

export default async function AiControlsPage() {
  await requireAdmin('janitor')
  const data = await getAiControlsData()

  return (
    <AdminPage
      title="AI controls"
      icon={Power}
      eyebrow="Platform"
      description="The master switch for every AI surface — Vera, win-back drafts, help search, and the Profile Creator harvest. Flipping it off makes all of them fall back to their deterministic, non-AI behaviour."
    >
      <AiControlsView data={data} />
    </AdminPage>
  )
}
