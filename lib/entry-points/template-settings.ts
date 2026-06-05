// Operator template curation (ADR-126 Phase 2b). Which entry-point templates crew may
// use. The templates are a code registry (templates.ts); this layer reads the
// enabled/disabled override per template_id (a missing row ⇒ enabled). Server-only;
// untyped admin handle (table not in generated types until regen).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { listEntryTemplates, type EntryTemplate } from './templates'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** template_id → enabled. Absent keys mean enabled (default-on). */
export async function listTemplateEnabled(): Promise<Record<string, boolean>> {
  const { data } = await db().from('entry_template_settings').select('template_id, enabled')
  const map: Record<string, boolean> = {}
  for (const r of (data as { template_id: string; enabled: boolean }[] | null) ?? []) {
    map[r.template_id] = r.enabled
  }
  return map
}

/** The templates crew may currently use (registry minus operator-disabled). */
export async function crewEntryTemplates(): Promise<EntryTemplate[]> {
  const enabled = await listTemplateEnabled()
  return listEntryTemplates().filter((t) => enabled[t.id] !== false)
}

/** Every registry template + its enabled flag — for the operator governance UI. */
export async function listTemplateGovernance(): Promise<Array<EntryTemplate & { enabled: boolean }>> {
  const enabled = await listTemplateEnabled()
  return listEntryTemplates().map((t) => ({ ...t, enabled: enabled[t.id] !== false }))
}
