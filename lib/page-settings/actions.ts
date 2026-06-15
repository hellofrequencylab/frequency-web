'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { isSafeRoute } from '@/lib/layout/page-chrome'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { normalizeSeo, type SeoFields } from './seo'
import { normalizeStatus, type StatusFields } from './status'
import { parseLayout, orderedModuleIds, type LayoutConfig } from './layout'
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

/** One row in the on-page Layout editor: a known module, in resolved order, flagged on/off. */
export interface LayoutEditorItem {
  id: string
  label: string
  description: string
  enabled: boolean
}

/** The per-route layout for the editor (ADR-270): every known module in resolved order, each
 *  flagged enabled (visible) or not. Staff-gated read; defaults to registry order, all on. */
export async function getPageLayoutForEditor(route: string): Promise<LayoutEditorItem[]> {
  await gate()
  const build = (config: LayoutConfig): LayoutEditorItem[] => {
    const hidden = new Set(config.hidden)
    return orderedModuleIds(config, LAYOUT_MODULE_IDS).flatMap((id) => {
      const meta = moduleMeta(id)
      return meta ? [{ id: meta.id, label: meta.label, description: meta.description, enabled: !hidden.has(id) }] : []
    })
  }
  if (!isSafeRoute(route)) return build({ order: [], hidden: [] })
  const { loadPageSettings } = await import('./store')
  const row = await loadPageSettings(route)
  return build(parseLayout(row?.layout ?? null))
}

/** Save a route's layout (which modules show inside the page, and in what order). Order = the
 *  given id list (known ids only); hidden = the disabled ids. Upserts the layout jsonb. */
export async function savePageLayout(
  route: string,
  items: { id: string; enabled: boolean }[],
): Promise<ActionResult> {
  const me = await gate()
  if (!isSafeRoute(route)) return fail('That is not a valid app route.')
  const known = new Set(LAYOUT_MODULE_IDS)
  const valid = items.filter((it) => known.has(it.id))
  const order = valid.map((it) => it.id)
  const hidden = valid.filter((it) => !it.enabled).map((it) => it.id)
  const { error } = await db()
    .from('page_settings')
    .upsert({ route, layout: { order, hidden }, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: 'route' })
  if (error) return fail('Could not save the layout for that route.')

  revalidatePath(route)
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
