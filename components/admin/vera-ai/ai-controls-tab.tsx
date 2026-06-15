import { requireAdmin } from '@/lib/admin/guard'
import { getAiControlsData } from '@/app/(main)/admin/ai/load-ai'
import { AiControlsView } from '@/app/(main)/admin/ai/ai-controls-view'

// The "AI controls" tab of the consolidated Vera & AI workspace (ADR-265) — formerly
// /admin/ai. The master switch for every AI surface, usage, and the switch history; the
// shared AiControlsView + loader + setAiEnabled/reindexHelp actions are reused unchanged.
// Gate: janitor OR `platform`-domain staff (write) — re-asserted here (the workspace hides
// this tab otherwise). The kill switch stays out of reach of the functional departments.
export async function AiControlsTab() {
  await requireAdmin('janitor', { staff: 'platform' })
  const data = await getAiControlsData()
  return <AiControlsView data={data} />
}
