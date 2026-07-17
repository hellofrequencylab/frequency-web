import { requireAdmin } from '@/lib/admin/guard'
import { getAiControlsData } from '@/app/(main)/admin/ai/load-ai'
import { getAutonomyControlsData } from '@/app/(main)/admin/ai/load-autonomy'
import { AiControlsView } from '@/app/(main)/admin/ai/ai-controls-view'

// The "AI controls" tab of the consolidated Vera & AI workspace (ADR-265) — formerly
// /admin/ai. The master switch for every AI surface, usage, and the switch history, PLUS the
// Vera autonomous-send controls (circuit breaker + graduation, default OFF). The shared
// AiControlsView + loaders + actions are reused. Gate: janitor OR `platform`-domain staff
// (write) — re-asserted here (the workspace hides this tab otherwise). The kill switches stay
// out of reach of the functional departments.
export async function AiControlsTab() {
  await requireAdmin('janitor', { staff: 'platform' })
  const [data, autonomy] = await Promise.all([getAiControlsData(), getAutonomyControlsData()])
  return <AiControlsView data={data} autonomy={autonomy} />
}
