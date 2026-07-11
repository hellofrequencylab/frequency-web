'use server'

import { revalidatePath } from 'next/cache'
import type { Database, Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { loadRootSpaceId, getSpaceById } from '@/lib/spaces/store'
import { isSafeRoute } from '@/lib/layout/page-chrome'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { normalizeSeoForPane, type SeoFields, type SeoPane } from './seo'
import { normalizeStatus, type StatusFields } from './status'
import { parseLayout, moduleAssignments, isLayoutScopeKey, isModuleRole, hasLayoutConfig, normalizeRowHeader, type LayoutConfig, type ModuleRole, type SlotConfig } from './layout'
import { defaultLayoutFor } from './default-layouts'
import { moduleIdsForScope, moduleMeta } from '@/lib/widgets/modules'
import { isTemplateId, templateMeta, slotIds, defaultSlotId, DEFAULT_TEMPLATE, type TemplateId } from '@/lib/widgets/templates'

// Server actions for the on-page Page settings panel (ADR-268). Writes go through the
// service-role admin client into public.page_settings, scoped to a SPACE (Phase 0.5a):
// page_settings is re-keyed to (space_id, route), so every upsert carries the resolved
// space_id and uses onConflict 'space_id,route'.
//
// AUTHZ (Phase 0.5a): one server-enforced gate, two admitted paths.
//   - STAFF (web_role admin+, ADR-208) may edit ANY space — including the ROOT space, so the
//     existing single-tenant staff path is unchanged (the canary: with no spaceId, the target
//     is root and only staff pass, exactly as before).
//   - A SPACE OPERATOR (the target space's owner_profile_id) may edit ONLY their own space's
//     rows. `gateForSpace(spaceId)` resolves the target space (default = root), admits a staff
//     caller OR the space's owner, and FAILS CLOSED otherwise — returning null so the action
//     yields a clean fail result (not a redirect, so an operator is never bounced).
// The route is isSafeRoute-validated and the SEO fields are normalized/bounded before any write.

// The resolved write context: the effective tenant + the editor's profile id (for updated_by).
interface SpaceGate {
  spaceId: string
  profileId: string
}

/** Authorize an edit against a space and resolve the write context. Defaults to the ROOT
 *  space (the single-tenant canary). Admits STAFF (any space) or the target space's OWNER
 *  (their space only). Returns null when the caller may not edit this space — the action
 *  returns a fail result rather than a redirect, so an operator never gets bounced. */
async function gateForSpace(spaceId?: string | null): Promise<SpaceGate | null> {
  const profile = await getCallerProfile()
  if (!profile) return null
  const sid = spaceId ?? (await loadRootSpaceId())
  if (!sid) return null
  // Staff may edit any space (and the root single-tenant path stays staff-only as today).
  if (isStaff(profile.webRole)) return { spaceId: sid, profileId: profile.id }
  // Otherwise the caller must own the target space.
  const space = await getSpaceById(sid)
  if (space && space.ownerProfileId === profile.id) return { spaceId: sid, profileId: profile.id }
  return null
}

function db() {
  return createAdminClient()
}

/** Save the per-route SEO for a space (default root). Upserts the (space_id, route) row.
 *
 *  The settings spine splits these fields across two panes (the settings hierarchy): "Basics"
 *  owns title + header image, "SEO & meta" owns description + share image. So an optional `pane`
 *  scopes the write to JUST that pane's columns — the action reads the existing row and MERGES,
 *  so saving one pane never nulls the other pane's fields on the shared row. With no `pane`, the
 *  full set is written (the legacy single-form behavior). */
export async function savePageSeo(
  route: string,
  input: { title?: string; description?: string; ogImage?: string; headerImage?: string; headerFocal?: string },
  spaceId?: string | null,
  pane?: SeoPane,
): Promise<ActionResult> {
  const ctx = await gateForSpace(spaceId)
  if (!ctx) return fail('You can only edit your own space.')
  if (!isSafeRoute(route)) return fail('That is not a valid app route.')
  const fields = normalizeSeoForPane(input, pane)
  if (!fields) return fail('An image must be an https URL or a path that starts with /.')

  // Merge over the existing row so a pane only ever writes its OWN columns: read the current
  // SEO, then overlay the normalized pane fields. (With no pane, `fields` already carries all
  // four, so the merge is a full overwrite — the legacy behavior.)
  const { loadPageSettings } = await import('./store')
  const current = await loadPageSettings(route, ctx.spaceId)
  const merged: SeoFields = {
    seo_title: current?.seo_title ?? null,
    seo_description: current?.seo_description ?? null,
    og_image_url: current?.og_image_url ?? null,
    header_image_url: current?.header_image_url ?? null,
    header_image_focal: current?.header_image_focal ?? null,
    ...fields,
  }

  // space_id + header_image_url aren't in the generated types yet — cast the payload (ADR-246),
  // not the client. onConflict is the (space_id, route) composite key.
  const payload = { route, space_id: ctx.spaceId, ...merged, updated_by: ctx.profileId, updated_at: new Date().toISOString() }
  const { error } = await db()
    .from('page_settings')
    .upsert(payload as unknown as Database['public']['Tables']['page_settings']['Insert'], { onConflict: 'space_id,route' })
  if (error) return fail('Could not save SEO for that route.')

  revalidatePath(route)
  return ok()
}

/** The current SEO for the editor (space-gated read; default root). Defaults to empty fields. */
export async function getPageSeoForEditor(route: string, spaceId?: string | null): Promise<SeoFields> {
  const ctx = await gateForSpace(spaceId)
  const empty: SeoFields = { seo_title: null, seo_description: null, og_image_url: null, header_image_url: null, header_image_focal: null }
  if (!ctx || !isSafeRoute(route)) return empty
  const { loadPageSettings } = await import('./store')
  const row = await loadPageSettings(route, ctx.spaceId)
  return row
    ? {
        seo_title: row.seo_title,
        seo_description: row.seo_description,
        og_image_url: row.og_image_url,
        header_image_url: row.header_image_url,
        header_image_focal: row.header_image_focal,
      }
    : empty
}

/** Save a route's status (draft/published) + visibility (lowest community rung). Upserts;
 *  enforced fail-safe in (main)/layout.tsx. Only these two columns are touched. */
export async function savePageStatus(
  route: string,
  input: { status?: string; visibilityRole?: string | null },
  spaceId?: string | null,
): Promise<ActionResult> {
  const ctx = await gateForSpace(spaceId)
  if (!ctx) return fail('You can only edit your own space.')
  if (!isSafeRoute(route)) return fail('That is not a valid app route.')
  const fields = normalizeStatus(input)
  // space_id isn't in the generated types yet — cast the payload (ADR-246), not the client.
  const payload = { route, space_id: ctx.spaceId, status: fields.status, visibility_role: fields.visibility_role, updated_by: ctx.profileId, updated_at: new Date().toISOString() }
  const { error } = await db()
    .from('page_settings')
    .upsert(payload as unknown as Database['public']['Tables']['page_settings']['Insert'], { onConflict: 'space_id,route' })
  if (error) return fail('Could not save status for that route.')

  revalidatePath(route)
  return ok()
}

/** The current status + visibility for the editor (space-gated read; default root). Defaults to live/anyone. */
export async function getPageStatusForEditor(route: string, spaceId?: string | null): Promise<StatusFields> {
  const ctx = await gateForSpace(spaceId)
  const dflt: StatusFields = { status: 'published', visibility_role: null }
  if (!ctx || !isSafeRoute(route)) return dflt
  const { loadPageSettings } = await import('./store')
  const row = await loadPageSettings(route, ctx.spaceId)
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

/** A slot's optional ROW HEADER for the editor (ADR-562): the heading text + whether it is
 *  toggled on. Keyed by slot id in LayoutEditorState.headers. */
export interface SlotHeaderState {
  text: string
  enabled: boolean
}

/** The editor's full view of a scope's layout: the chosen interior template, every module in
 *  slot/render order, and each slot's optional row header (keyed by slot id). */
export interface LayoutEditorState {
  template: TemplateId
  items: LayoutEditorItem[]
  /** Per-slot row header (text + on/off), keyed by slot id. A slot with no header is absent. */
  headers: Record<string, SlotHeaderState>
}

/** The saved layout at a SCOPE KEY for the editor (ADR-270/271/272): the interior template plus
 *  every known module mapped to a slot, in render order, each flagged enabled (visible) or not
 *  and carrying its role gate. The key is the exact route, a section ('/seg/*'), or the global
 *  default ('*'); this reads THAT level's OWN config (not the cascade), so staff see what is set
 *  at the level they edit. Staff-gated; defaults to the Single template, all on, no gates. */
export async function getPageLayoutForEditor(key: string, spaceId?: string | null): Promise<LayoutEditorState> {
  const ctx = await gateForSpace(spaceId)
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
    // Surface each slot's saved row header (text + on/off) so the editor can prefill its fields.
    headers: Object.fromEntries(
      Object.entries(config.slots).flatMap(([slotId, slot]) => {
        const text = normalizeRowHeader(slot.header)
        return text || slot.headerEnabled ? [[slotId, { text: text ?? '', enabled: slot.headerEnabled === true }] as const] : []
      }),
    ),
  })
  if (!ctx || !isLayoutKey(key)) return build({ template: DEFAULT_TEMPLATE, slots: {} })
  // Read THIS space's row at the level's OWN key (a scope key never passes isSafeRoute, so we
  // read directly here inside the gated action rather than via the route-only reader). The read
  // is scoped to (space_id, route) — space_id isn't in the generated types yet, so reach it with
  // an untyped client (ADR-246).
  const q = db().from('page_settings') as unknown as {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { layout: unknown } | null }> }
      }
    }
  }
  const { data } = await q.select('layout').eq('space_id', ctx.spaceId).eq('route', key).maybeSingle()
  // Nothing saved at this level → open the editor on the route's coded default (so it matches what
  // the page renders), else the registry default. A saved config at this level always wins.
  const saved = parseLayout(data?.layout ?? null)
  return build(hasLayoutConfig(saved) ? saved : defaultLayoutFor(key) ?? saved)
}

/** Save the layout at a SCOPE KEY: the interior template, which modules sit in each slot, in
 *  what order, and the per-module role gates. The key is a concrete route, a section ('/seg/*'),
 *  or the global default ('*'); resolution is most-specific-wins (ADR-271). Upserts the
 *  { template, slots } jsonb. */
export async function savePageLayout(
  key: string,
  input: {
    template?: string
    items: { id: string; enabled: boolean; role?: string | null; slot?: string }[]
    /** Per-slot row header (ADR-562), keyed by slot id. Each is normalized + bounded on write. */
    headers?: Record<string, { text?: string; enabled?: boolean } | undefined>
  },
  spaceId?: string | null,
): Promise<ActionResult> {
  const ctx = await gateForSpace(spaceId)
  if (!ctx) return fail('You can only edit your own space.')
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
  // Row headers, keyed by slot id — only the constant template's slots are read (so a crafted
  // slot key can't inject a property), and each text is normalized + bounded.
  const headerById = input.headers ?? {}
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
    const slot: SlotConfig = { order, hidden, roles }
    // Carry a row header only when it has non-empty text; the on/off flag persists as `true`
    // (a disabled/absent header stays out of the jsonb, so existing rows are unchanged).
    const header = normalizeRowHeader(headerById[s.id]?.text)
    if (header) {
      slot.header = header
      if (headerById[s.id]?.enabled === true) slot.headerEnabled = true
    }
    slotConfigs[s.id] = slot
  }

  // The payload carries space_id (not in the generated types yet — cast it, ADR-246) and the
  // known-good { template, slots } jsonb tree; onConflict is the (space_id, route) composite key.
  const payload = { route: key, space_id: ctx.spaceId, layout: { template, slots: slotConfigs } as unknown as Json, updated_by: ctx.profileId, updated_at: new Date().toISOString() }
  const { error } = await db()
    .from('page_settings')
    .upsert(payload as unknown as Database['public']['Tables']['page_settings']['Insert'], { onConflict: 'space_id,route' })
  if (error) return fail('Could not save the layout for that scope.')

  // A concrete route refreshes just that page; a scope edit is broad, so purge all cached
  // pages (rare operator action) — the cascade is read per request on the next visit.
  if (isSafeRoute(key)) revalidatePath(key)
  else revalidatePath('/', 'layout')
  return ok()
}

