import { Power } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { getAiControlsData } from './load-ai'
import { AiControlsView } from './ai-controls-view'

export const dynamic = 'force-dynamic'

// Gate (PB.1h): community janitor OR a staff role holding the `platform` domain
// (write — Owner/Admin staff only; ADR-127), matching this page's entry in
// app/(main)/admin/sections.ts. The kill switch stays out of reach of the
// functional departments. The SETTINGS template (ADR-233 §3.8): the AI controls are a
// stack of annotated FormSections — the master switch autosaves with inline "Saved", the
// usage table + switch history are read-only references.
export default async function AiControlsPage() {
  await requireAdmin('janitor', { staff: 'platform' })
  const data = await getAiControlsData()

  return (
    <AdminTemplate
      title="AI controls"
      icon={Power}
      eyebrow="Operations"
      description="The master switch for every AI surface (Vera, win-back drafts, help search, and the Profile Creator harvest). Flipping it off makes all of them fall back to their deterministic, non-AI behaviour."
    >
      <AiControlsView data={data} />
    </AdminTemplate>
  )
}
