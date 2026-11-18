// Journeys: merge a layout save (enabled + order) onto the stored page_config (JRN-001).
//
// The Advanced "Discovery layout" control sends only the discovery widgets it lists, as bare
// `{ id, enabled }` rows. page_config also carries data that is not layout: the story widget's
// settings hold the authored outcomes, guarantee and FAQ (LIVE-393/395), and the reserved
// `wizard` row holds the guide's progress (ADR-839). Writing the layout array as-is erased all of
// that. This merge takes ONLY `enabled` and order from the save, keeps every entry's stored
// settings, and keeps every stored entry the save did not name (other modes, the wizard row).
//
// PURE, so the server action and vitest share it.

import type { PageWidgetConfig } from '@/lib/journey-plans'

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

export function mergePageLayout(
  stored: PageWidgetConfig[] | null | undefined,
  layout: readonly { id: string; enabled: boolean }[] | null | undefined,
): PageWidgetConfig[] {
  const prior = (stored ?? []).filter((e): e is PageWidgetConfig => !!e && typeof e.id === 'string')
  const byId = new Map(prior.map((e) => [e.id, e]))
  const named = new Set<string>()
  const out: PageWidgetConfig[] = []
  for (const row of layout ?? []) {
    if (!row || typeof row.id !== 'string' || named.has(row.id)) continue
    named.add(row.id)
    const prev = byId.get(row.id)
    const entry: PageWidgetConfig = { id: row.id, enabled: !!row.enabled }
    if (prev && isPlain(prev.settings)) entry.settings = prev.settings
    out.push(entry)
  }
  for (const e of prior) if (!named.has(e.id)) out.push(e)
  return out
}
