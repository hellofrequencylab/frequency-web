'use server'

import { revalidatePath } from 'next/cache'
import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { isSafeRoute } from '@/lib/layout/page-chrome'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { normalizeSeo, type SeoFields } from './seo'
import { normalizeStatus, type StatusFields } from './status'
import { parseLayout, moduleAssignments, isLayoutScopeKey, isModuleRole, type LayoutConfig, type ModuleRole, type SlotConfig } from './layout'
import { moduleIdsForScope, moduleMeta } from '@/lib/widgets/modules'
import { isTemplateId, templateMeta, slotIds, defaultSlotId, DEFAULT_TEMPLATE, type TemplateId } from '@/lib/widgets/templates'

// Server actions for the on-page Page settings panel (ADR-268). STAFF (admin+, ADR-208 —
// "admin and above"): the gate redirects an unauthorized viewer and captures the id for
// `updated_by`. Writes go through the service-role admin client into public.page_settings
// (typed now that the table is in the generated types). The route is isSafeRoute-validated
// and the SEO fields are normalized/bounded (lib/page-settings/seo.ts) before any write.

async function gate(): Promise<string> {
  const { profileId } = await requireAdmin('admin')
  return profileId
}

function db() {
  return createAdminClient()
}

/** Save the per-route SEO (title / description / share image). Upserts the row. */
export async function savePageSeo(
  route: string,
  input: { title?: string; description?: string; ogImage?: string },
): Promise<ActionResult> {
  const me = await gate()
  if (!isSafeRoute(route)) return fail('That is not a valid app route.')
  const fields = normalizeSeo(input)
  if (!fields) return fail('The share image must be an https URL or a path that starts with /.')

  const { error } = await db()
    .from('page_settings')
    .upsert({ route, ...fields, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: 'route' })
  if (error) return fail('Could not save SEO for that route.')

  revalidatePath(route)
  return ok()
}

/** The current SEO for the editor (staff-gated read). Defaults to empty fields. */
export async function getPageSeoForEditor(route: string): Promise<SeoFields> {
  await gate()
  const empty: SeoFields = { seo_title: null, seo_description: null, og_image_url: null }
  if (!isSafeRoute(route)) return empty
  const { loadPageSettings } = await import('./store')
  const row = await loadPageSettings(route)
  return row
    ? { seo_title: row.seo_title, seo_description: row.seo_description, og_image_url: row.og_image_url }
    : empty
}

/** Save a route's status (draft/published) + visibility (lowest community rung). Upserts;
 *  enforced fail-safe in (main)/layout.tsx. Only these two columns are touched. */
export async function savePageStatus(
  route: string,
  input: { status?: string; visibilityRole?: string | null },
): Promise<ActionResult> {
  const me = await gate()
  if (!isSafeRoute(route)) return fail('That is not a valid app route.')
  const fields = normalizeStatus(input)
  const { error } = await db()
    .from('page_settings')
    .upsert(
      { route, status: fields.status, visibility_role: fields.visibility_role, updated_by: me, updated_at: new Date().toISOString() },
      { onConflict: 'route' },
    )
  if (error) return fail('Could not save status for that route.')

  revalidatePath(route)
  return ok()
}

/** The current status + visibility for the editor (staff-gated read). Defaults to live/anyone. */
export async function getPageStatusForEditor(route: string): Promise<StatusFields> {
  await gate()
  const dflt: StatusFields = { status: 'published', visibility_role: null }
  if (!isSafeRoute(route)) return dflt
  const { loadPageSettings } = await import('./store')
  const row = await loadPageSettings(route)
  if (!row) return dflt
  return {
    status: row.status === 'draft' ? 'draft' : 'published',
    visibility_role: (row.visibility_role as StatusFields['visibility_role']) ?? null,
  }
}

/** A layout EDITOR key: a concrete route OR a scope key ('*' / '/seg/*', ADR-271). */
function isLayoutKey(key: string): boolean {
  return isSafeRoute(key) || isLayoutScopeKey(key)
}

/** One row in the on-page Layout editor: a known module, its slot assignment, on/off state, and
 *  per-module role gate (null = everyone). */
export interface LayoutEditorItem {
  id: string
  label: string
  description: string
  enabled: boolean
  role: ModuleRole | null
  slot: string
}

/** The editor's full view of a scope's layout: the chosen interior template + every module in
 *  slot/render order. */
export interface LayoutEditorState {
  template: TemplateId
  items: LayoutEditorItem[]
}

/** The saved layout at a SCOPE KEY for the editor (ADR-270/271/272): the interior template plus
 *  every known module mapped to a slot, in render order, each flagged enabled (visible) or not
 *  and carrying its role gate. The key is the exact route, a section ('/seg/*'), or the global
 *  default ('*'); this reads THAT level's OWN config (not the cascade), so staff see what is set
 *  at the level they edit. Staff-gated; defaults to the Single template, all on, no gates. */
export async function getPageLayoutForEditor(key: string): Promise<LayoutEditorState> {
  await gate()
  // The module SET is scoped to the key being edited (ADR-294), so each route's Layout panel
  // offers exactly the blocks that route renders — not the global catalog.
  const moduleIds = moduleIdsForScope(key)
  const build = (config: LayoutConfig): LayoutEditorState => ({
    template: config.template,
    items: moduleAssignments(config, moduleIds).flatMap((a) => {
      const meta = moduleMeta(a.id)
      return meta
        ? [{ id: meta.id, label: meta.label, description: meta.description, enabled: a.enabled, role: isModuleRole(a.role) ? a.role : null, slot: a.slot }]
        : []
    }),
  })
  if (!isLayoutKey(key)) return build({ template: DEFAULT_TEMPLATE, slots: {} })
  // Read the level's OWN row (a scope key never passes isSafeRoute, so we read directly here
  // inside the staff-gated action rather than via the route-only loadPageSettings reader).
  const { data } = await db().from('page_settings').select('layout').eq('route', key).maybeSingle()
  return build(parseLayout(data?.layout ?? null))
}

/** Save the layout at a SCOPE KEY: the interior template, which modules sit in each slot, in
 *  what order, and the per-module role gates. The key is a concrete route, a section ('/seg/*'),
 *  or the global default ('*'); resolution is most-specific-wins (ADR-271). Upserts the
 *  { template, slots } jsonb. */
export async function savePageLayout(
  key: string,
  input: { template?: string; items: { id: string; enabled: boolean; role?: string | null; slot?: string }[] },
): Promise<ActionResult> {
  const me = await gate()
  if (!isLayoutKey(key)) return fail('That is not a valid page or scope.')
  const template: TemplateId = isTemplateId(input.template) ? input.template : DEFAULT_TEMPLATE
  const slots = slotIds(template)
  const def = defaultSlotId(template)

  // Only the key's own module set is writable (ADR-294) — a crafted id for another page's
  // block is dropped as unknown, same as an unknown module.
  const moduleSet = moduleIdsForScope(key)
  const known = new Set(moduleSet)
  const valid = (input.items ?? []).filter((it) => known.has(it.id))
  const orderedIds = valid.map((it) => it.id)
  // Lookups keyed by module id (VALUES only from the request); the slot is normalized to a real
  // slot of the chosen template, else the default.
  const slotById = new Map(valid.map((it) => [it.id, it.slot && slots.includes(it.slot) ? it.slot : def]))
  const enabledById = new Map(valid.map((it) => [it.id, it.enabled]))
  const roleById = new Map(valid.map((it) => [it.id, it.role]))

  // Build the per-slot config by iterating the CONSTANT template + module catalog, never the
  // request, so every property KEY (slot id, module id) is a known literal — a crafted `id` or
  // `slot` can't inject an arbitrary property. The request only supplies validated VALUES.
  const slotConfigs: Record<string, SlotConfig> = {}
  for (const s of templateMeta(template).slots) {
    const order = orderedIds.filter((id) => slotById.get(id) === s.id)
    const hidden = order.filter((id) => enabledById.get(id) === false)
    const roles: Record<string, ModuleRole> = {}
    for (const id of moduleSet) {
      if (slotById.get(id) !== s.id) continue
      const role = roleById.get(id)
      if (isModuleRole(role)) roles[id] = role
    }
    slotConfigs[s.id] = { order, hidden, roles }
  }

  const { error } = await db()
    .from('page_settings')
    // The layout is a known-good { template, slots } tree; cast to the column's jsonb type
    // (TS can't infer a known-key object satisfies the recursive Json type).
    .upsert({ route: key, layout: { template, slots: slotConfigs } as unknown as Json, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: 'route' })
  if (error) return fail('Could not save the layout for that scope.')

  // A concrete route refreshes just that page; a scope edit is broad, so purge all cached
  // pages (rare operator action) — the cascade is read per request on the next visit.
  if (isSafeRoute(key)) revalidatePath(key)
  else revalidatePath('/', 'layout')
  return ok()
}

/** Clear a route's SEO back to the code default (null the fields). */
export async function clearPageSeo(route: string): Promise<ActionResult> {
  await gate()
  if (!isSafeRoute(route)) return fail('That is not a valid app route.')
  const { error } = await db()
    .from('page_settings')
    .update({ seo_title: null, seo_description: null, og_image_url: null, updated_at: new Date().toISOString() })
    .eq('route', route)
  if (error) return fail('Could not clear SEO for that route.')

  revalidatePath(route)
  return ok()
}
