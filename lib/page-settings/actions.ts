'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { isSafeRoute } from '@/lib/layout/page-chrome'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { normalizeSeo, type SeoFields } from './seo'
import { normalizeStatus, type StatusFields } from './status'
import { parseLayout, orderedModuleIds, isLayoutScopeKey, isModuleRole, type LayoutConfig, type ModuleRole } from './layout'
import { LAYOUT_MODULE_IDS, moduleMeta } from '@/lib/widgets/modules'

// Server actions for the on-page Page settings panel (ADR-268). STAFF (admin+, ADR-208 —
// "admin and above"): the gate redirects an unauthorized viewer and captures the id for
// `updated_by`. Writes go through the service-role admin client into public.page_settings;
// `page_settings` isn't in the generated types yet, so the client is cast loose (fail-safe
// reader handles the pre-migration window). The route is isSafeRoute-validated and the SEO
// fields are normalized/bounded (lib/page-settings/seo.ts) before any write.

async function gate(): Promise<string> {
  const { profileId } = await requireAdmin('admin')
  return profileId
}

function db(): SupabaseClient {
  // page_settings isn't in the generated DB types yet (regenerated separately per the
  // migration), so the client is cast loose; every write here is staff-gated + validated.
  // eslint-disable-next-line no-restricted-syntax
  return createAdminClient() as unknown as SupabaseClient
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

/** One row in the on-page Layout editor: a known module, in resolved order, with its on/off
 *  state and per-module role gate (null = everyone). */
export interface LayoutEditorItem {
  id: string
  label: string
  description: string
  enabled: boolean
  role: ModuleRole | null
}

/** The saved layout at a SCOPE KEY for the editor (ADR-270/271): every known module in
 *  resolved order, each flagged enabled (visible) or not and carrying its role gate. The key
 *  is the exact route, a section ('/seg/*'), or the global default ('*'); this reads THAT
 *  level's own config (not the cascade), so staff see what is set at the level they edit.
 *  Staff-gated; defaults to registry order, all on, no gates. */
export async function getPageLayoutForEditor(key: string): Promise<LayoutEditorItem[]> {
  await gate()
  const build = (config: LayoutConfig): LayoutEditorItem[] => {
    const hidden = new Set(config.hidden)
    return orderedModuleIds(config, LAYOUT_MODULE_IDS).flatMap((id) => {
      const meta = moduleMeta(id)
      if (!meta) return []
      const role = config.roles[id]
      return [{ id: meta.id, label: meta.label, description: meta.description, enabled: !hidden.has(id), role: isModuleRole(role) ? role : null }]
    })
  }
  if (!isLayoutKey(key)) return build({ order: [], hidden: [], roles: {} })
  // Read the level's OWN row (a scope key never passes isSafeRoute, so we read directly here
  // inside the staff-gated action rather than via the route-only loadPageSettings reader).
  const { data } = await db().from('page_settings').select('layout').eq('route', key).maybeSingle()
  return build(parseLayout((data as { layout: unknown } | null)?.layout ?? null))
}

/** Save the layout at a SCOPE KEY: which modules show, in what order, and the per-module role
 *  gates. The key is a concrete route, a section ('/seg/*'), or the global default ('*');
 *  resolution is most-specific-wins (ADR-271). Order = the given id list (known ids only);
 *  hidden = the disabled ids; roles = the set gates. Upserts the layout jsonb. */
export async function savePageLayout(
  key: string,
  items: { id: string; enabled: boolean; role?: string | null }[],
): Promise<ActionResult> {
  const me = await gate()
  if (!isLayoutKey(key)) return fail('That is not a valid page or scope.')
  const known = new Set(LAYOUT_MODULE_IDS)
  const valid = items.filter((it) => known.has(it.id))
  const order = valid.map((it) => it.id)
  const hidden = valid.filter((it) => !it.enabled).map((it) => it.id)
  // Build the roles map by iterating the CONSTANT catalog, never the request: the property
  // KEY is always a known module id (not a user-supplied value), so a crafted `id` can't
  // inject an arbitrary property. The request only supplies the validated role VALUE.
  const requestedRole = new Map(valid.map((it) => [it.id, it.role]))
  const roles: Record<string, ModuleRole> = {}
  for (const id of LAYOUT_MODULE_IDS) {
    const role = requestedRole.get(id)
    if (isModuleRole(role)) roles[id] = role
  }

  const { error } = await db()
    .from('page_settings')
    .upsert({ route: key, layout: { order, hidden, roles }, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: 'route' })
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
