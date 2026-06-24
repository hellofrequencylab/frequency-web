'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { menuDb } from './db'
import { defaultMenu, DEFAULT_MENU_SETTINGS, isPinnedRailItem } from './defaults'
import { getAdminMenu } from './read'
import { getMenuConfig } from '@/lib/menu-config'
import { STAFF_DOMAINS, ACCESS_LEVELS, type StaffDomain, type Access } from '@/lib/core/staff-roles'
import type {
  MenuAccess,
  MenuMode,
  MenuSettings,
  MenuSurfaceKey,
  ResolvedCategory,
  ResolvedItem,
  ResolvedMenu,
} from './types'

// Janitor-gated CRUD for the DB-backed menu system. Mirrors
// app/(main)/admin/menu/actions.ts: a requireJanitor() gate on the web_role staff
// axis (ADR-208), writes via the service-role admin client, and a layout-wide
// revalidate after each write so every header refreshes. The menu tables are not in
// the generated types yet (regenerate lib/database.types.ts after the migration is
// applied, ADR-246 pattern), so the admin client is cast to an untyped shape.
//
// Every action returns a Result so the editor can surface errors inline rather than
// throwing past the server-action boundary. Inputs are validated defensively:
// numeric ranges are clamped to the DB CHECK constraints and unknown enum values are
// rejected before they ever reach the database.

type Result = { ok: true } | { ok: false; error: string }
type EnsureResult = { ok: true; id: string } | { ok: false; error: string }

const SURFACE_KEYS: readonly MenuSurfaceKey[] = ['header', 'left', 'footer', 'profile', 'admin_header']
const MODE_VALUES: readonly MenuMode[] = ['active', 'ghost', 'hidden']
const ACCESS_VALUES: readonly MenuAccess[] = [
  'visitor',
  'member',
  'crew',
  'host',
  'guide',
  'mentor',
  'admin',
  'janitor',
]
const SIDE_VALUES = ['left', 'right'] as const

/** Janitor-only guard, mirroring app/(main)/admin/menu/actions.ts. Gated on the
 *  web_role staff axis (ADR-208), the canonical platform-owner check. */
async function requireJanitor() {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')
  return caller
}

/** The untyped admin client, the menu tables aren't in the generated types yet. */
function adminDb() {
  return menuDb()
}

function isSurface(v: unknown): v is MenuSurfaceKey {
  return typeof v === 'string' && (SURFACE_KEYS as readonly string[]).includes(v)
}
function isMode(v: unknown): v is MenuMode {
  return typeof v === 'string' && (MODE_VALUES as readonly string[]).includes(v)
}
function isAccess(v: unknown): v is MenuAccess {
  return typeof v === 'string' && (ACCESS_VALUES as readonly string[]).includes(v)
}
function isStaffDomain(v: unknown): v is StaffDomain {
  return typeof v === 'string' && (STAFF_DOMAINS as readonly string[]).includes(v)
}
function isStaffLevel(v: unknown): v is Access {
  return typeof v === 'string' && (ACCESS_LEVELS as readonly string[]).includes(v)
}
/** Resolve a staff-domain input to a clean column value: a valid domain, or null
 *  (clears the gate). Unknown strings are rejected to null rather than written. */
function cleanStaffDomain(v: unknown): string | null {
  return isStaffDomain(v) ? v : null
}
function cleanStaffLevel(v: unknown): string | null {
  return isStaffLevel(v) ? v : null
}

/** Clamp to the column CHECK ranges. `null`/`undefined` pass through unchanged. */
function clampSpan(v: number | null | undefined): number | null | undefined {
  if (v == null) return v
  return Math.max(1, Math.min(12, Math.trunc(v)))
}
function clampColumns(v: number): number {
  return Math.max(1, Math.min(12, Math.trunc(v)))
}
function clampGrid(v: number | null | undefined): number | null | undefined {
  // grid_col / grid_row are free smallints (no CHECK); just coerce to int when set.
  if (v == null) return v
  return Math.trunc(v)
}

/** Filter a role_modes blob down to valid { role: MenuMode } entries.
 *
 *  The role KEY is whitelisted against the fixed MenuAccess set (isAccess), not just
 *  checked for being a string: the blob is user-supplied, so writing an arbitrary key
 *  into an object is a property-injection / prototype-pollution vector (a key like
 *  "__proto__" or "constructor"). Constraining keys to the known role set closes that
 *  and also keeps only roles the renderer can resolve. */
function sanitizeRoleModes(v: unknown): Record<string, MenuMode> {
  if (!v || typeof v !== 'object') return {}
  const out: Record<string, MenuMode> = {}
  for (const [role, mode] of Object.entries(v as Record<string, unknown>)) {
    if (isAccess(role) && isMode(mode)) out[role] = mode
  }
  return out
}

// ── Menu lifecycle ────────────────────────────────────────────────────────────

/** Get-or-create the GLOBAL (space_id IS NULL) menu row for a surface. */
export async function ensureMenu(surfaceKey: MenuSurfaceKey): Promise<EnsureResult> {
  try {
    await requireJanitor()
    if (!isSurface(surfaceKey)) return { ok: false, error: 'Unknown surface' }

    const db = adminDb()
    const { data: existing, error: readErr } = await db
      .from<{ id: string }>('menus')
      .select('id')
      .eq('surface_key', surfaceKey)
      .is('space_id', null)
      .limit(1)
    if (readErr) return { ok: false, error: readErr.message }
    const found = (existing ?? [])[0]
    if (found) return { ok: true, id: found.id }

    const def = defaultMenu(surfaceKey)
    const { data: inserted, error: insErr } = await db
      .from<{ id: string }>('menus')
      .insert({ space_id: null, surface_key: surfaceKey, label: def.label, columns: def.columns })
      .select('id')
      .limit(1)
    if (insErr) return { ok: false, error: insErr.message }
    const row = (inserted ?? [])[0]
    if (!row) return { ok: false, error: 'Insert returned no row' }

    revalidatePath('/', 'layout')
    return { ok: true, id: row.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'ensureMenu failed' }
  }
}

/** Bridge the operator's existing GLOBAL menu_config into a freshly built left_rail
 *  default, so seeding reproduces the rail the operator currently sees:
 *    • each seeded item carries `icon = area.key` (see leftRailMenu), so we look the
 *      area key up in the saved config;
 *    • a key with a saved position takes that position (relative order within its bucket
 *      is what the reader sorts by), unpositioned keys keep the code order;
 *    • a key the config marks `hidden` is seeded with the OFF base mode (mode='hidden')
 *      — the per-role matrix can still override it per role.
 *  Best-effort and total: any miss (empty config, read failure, unknown key) just leaves
 *  the plain default in place. Never throws. */
function bridgeLeftRailDefaults(
  def: ResolvedMenu,
  config: { order: Map<string, number>; hidden: Set<string> },
): ResolvedMenu {
  const apply = (it: ResolvedItem): ResolvedItem => {
    const key = it.icon // leftRailMenu stamps the NAV_AREAS key into `icon`
    if (!key) return it
    const next: ResolvedItem = { ...it }
    const pos = config.order.get(key)
    if (typeof pos === 'number') next.position = pos
    if (config.hidden.has(key)) next.mode = 'hidden'
    return next
  }
  const applyCat = (cat: ResolvedCategory): ResolvedCategory => ({
    ...cat,
    items: cat.items.map(apply).sort((a, b) => a.position - b.position),
    children: cat.children.map(applyCat),
  })
  return {
    ...def,
    rootItems: def.rootItems.map(apply).sort((a, b) => a.position - b.position),
    categories: def.categories.map(applyCat),
  }
}

/** Reset a surface to its code defaults IN THE DB: ensure the menu row, delete its
 *  existing categories / items / rail cards, then insert rows translated from
 *  defaultMenu(surfaceKey). For `left_rail`, the default is first bridged with the
 *  operator's saved menu_config (order + hidden) so seeding reproduces today's rail.
 *  Idempotent, running it again reproduces the same shape. */
export async function seedMenuFromDefaults(surfaceKey: MenuSurfaceKey): Promise<Result> {
  try {
    await requireJanitor()
    if (!isSurface(surfaceKey)) return { ok: false, error: 'Unknown surface' }

    const ensured = await ensureMenu(surfaceKey)
    if (!ensured.ok) return { ok: false, error: ensured.error }
    const menuId = ensured.id

    const db = adminDb()

    // Clear existing rows. menu_items / menu_categories cascade on menu delete, but
    // here the menu row survives a reseed, so delete the children explicitly. Items
    // first (they reference categories), then categories, then rail cards.
    const delItems = await db.from('menu_items').delete().eq('menu_id', menuId)
    if (delItems.error) return { ok: false, error: delItems.error.message }
    const delCats = await db.from('menu_categories').delete().eq('menu_id', menuId)
    if (delCats.error) return { ok: false, error: delCats.error.message }
    const delCards = await db.from('menu_rail_cards').delete().eq('menu_id', menuId)
    if (delCards.error) return { ok: false, error: delCards.error.message }

    let def = defaultMenu(surfaceKey)

    // Left rail: bridge the operator's saved menu_config (order + hidden) onto the
    // default so seeding reproduces the rail they currently see. Best-effort: any read
    // failure or empty config falls through to the plain default.
    if (surfaceKey === 'left') {
      try {
        const config = await getMenuConfig()
        if (config.order.size > 0 || config.hidden.size > 0) {
          def = bridgeLeftRailDefaults(def, config)
        }
      } catch {
        // Keep the plain default; never block seeding on the config read.
      }
    }

    // Sync the menu's columns to the default.
    const colUpd = await db.from('menus').update({ columns: clampColumns(def.columns) }).eq('id', menuId)
    if (colUpd.error) return { ok: false, error: colUpd.error.message }

    // Insert categories depth-first so a parent exists before its children. We map
    // each synthetic default id to its freshly-inserted DB uuid as we go.
    const idMap = new Map<string, string>()
    async function insertCategory(cat: ResolvedCategory, parentDbId: string | null): Promise<string | null> {
      const { data, error } = await db
        .from<{ id: string }>('menu_categories')
        .insert({
          menu_id: menuId,
          parent_id: parentDbId,
          label: cat.label ?? null,
          position: cat.position,
          grid_col: clampGrid(cat.gridCol) ?? null,
          grid_row: clampGrid(cat.gridRow) ?? null,
          col_span: clampSpan(cat.colSpan) ?? 1,
          min_access: cat.minAccess ?? 'visitor',
          staff_domain: cleanStaffDomain(cat.staffDomain),
          staff_level: cleanStaffLevel(cat.staffLevel),
          icon: cat.icon ?? null,
          blurb: cat.blurb ?? null,
        })
        .select('id')
        .limit(1)
      if (error) return null
      const dbId = (data ?? [])[0]?.id ?? null
      if (dbId) idMap.set(cat.id, dbId)
      return dbId
    }

    // Walk categories, inserting and capturing the id map.
    async function walk(cats: ResolvedCategory[], parentDbId: string | null): Promise<Result> {
      for (const cat of cats) {
        const dbId = await insertCategory(cat, parentDbId)
        if (!dbId) return { ok: false, error: `Failed to insert category ${cat.label ?? cat.id}` }
        const child = await walk(cat.children, dbId)
        if (!child.ok) return child
      }
      return { ok: true }
    }
    const walked = await walk(def.categories, null)
    if (!walked.ok) return walked

    // Insert items: root items (category_id null) + each category's items.
    type ItemInsert = {
      menu_id: string
      category_id: string | null
      label: string
      href: string
      subheading: string | null
      icon: string | null
      position: number
      col_span: number
      mode: MenuMode
      role_modes: Record<string, MenuMode>
      min_access: MenuAccess
      staff_domain: string | null
      staff_level: string | null
    }
    const itemRows: ItemInsert[] = []
    const pushItems = (cats: ResolvedCategory[]) => {
      for (const cat of cats) {
        const dbId = idMap.get(cat.id) ?? null
        for (const it of cat.items) {
          itemRows.push({
            menu_id: menuId,
            category_id: dbId,
            label: it.label,
            href: it.href,
            subheading: it.subheading ?? null,
            icon: it.icon ?? null,
            position: it.position,
            col_span: clampSpan(it.colSpan) ?? 1,
            mode: it.mode,
            role_modes: it.roleModes,
            min_access: it.minAccess,
            staff_domain: cleanStaffDomain(it.staffDomain),
            staff_level: cleanStaffLevel(it.staffLevel),
          })
        }
        pushItems(cat.children)
      }
    }
    for (const it of def.rootItems) {
      // Skip the fixed pinned Profile pin: it has no real DB row — the shell injects
      // Profile (with its per-viewer href) at runtime via withHomeProfile, so persisting
      // it here would duplicate it in the rail.
      if (isPinnedRailItem(it.id)) continue
      itemRows.push({
        menu_id: menuId,
        category_id: null,
        label: it.label,
        href: it.href,
        subheading: it.subheading ?? null,
        icon: it.icon ?? null,
        position: it.position,
        col_span: clampSpan(it.colSpan) ?? 1,
        mode: it.mode,
        role_modes: it.roleModes,
        min_access: it.minAccess,
        staff_domain: cleanStaffDomain(it.staffDomain),
        staff_level: cleanStaffLevel(it.staffLevel),
      })
    }
    pushItems(def.categories)

    if (itemRows.length > 0) {
      const insItems = await db.from('menu_items').insert(itemRows)
      if (insItems.error) return { ok: false, error: insItems.error.message }
    }

    // Insert rail cards.
    const cardRows = def.railCards.map((c) => ({
      menu_id: menuId,
      side: c.side,
      title: c.title,
      body: c.body,
      href: c.href,
      cta: c.cta ?? null,
      position: c.position,
      mode: c.mode,
      role_modes: c.roleModes,
    }))
    if (cardRows.length > 0) {
      const insCards = await db.from('menu_rail_cards').insert(cardRows)
      if (insCards.error) return { ok: false, error: insCards.error.message }
    }

    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'seedMenuFromDefaults failed' }
  }
}

/** Materialize a surface's code defaults into real DB rows and return the freshly assembled
 *  menu. The editor calls this when it opens a surface that is still the code default (synthetic
 *  ids) or whose row is empty, so per-item edits land on REAL rows instead of synthetic default
 *  ids. Seeds via seedMenuFromDefaults (which bridges the left rail's saved order), then re-reads
 *  through getAdminMenu so the editor adopts the real, editable menu. */
export async function materializeMenu(
  surfaceKey: MenuSurfaceKey,
): Promise<{ ok: true; menu: ResolvedMenu } | { ok: false; error: string }> {
  const seeded = await seedMenuFromDefaults(surfaceKey)
  if (!seeded.ok) return seeded
  const menu = await getAdminMenu(surfaceKey)
  return { ok: true, menu }
}

/** Set a menu's column count (clamped 1..12). */
export async function setMenuColumns(menuId: string, columns: number): Promise<Result> {
  try {
    await requireJanitor()
    if (!menuId) return { ok: false, error: 'Missing menu id' }
    const db = adminDb()
    const { error } = await db.from('menus').update({ columns: clampColumns(columns) }).eq('id', menuId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'setMenuColumns failed' }
  }
}

// ── Categories ──────────────────────────────────────────────────────────────

export type CreateCategoryInput = {
  menuId: string
  parentId?: string | null
  label?: string | null
  position?: number
  gridCol?: number | null
  gridRow?: number | null
  colSpan?: number
  minAccess?: MenuAccess
  staffDomain?: StaffDomain | null
  staffLevel?: Access | null
  icon?: string | null
  blurb?: string | null
}

export async function createCategory(input: CreateCategoryInput): Promise<EnsureResult> {
  try {
    await requireJanitor()
    if (!input?.menuId) return { ok: false, error: 'Missing menu id' }
    const db = adminDb()
    const { data, error } = await db
      .from<{ id: string }>('menu_categories')
      .insert({
        menu_id: input.menuId,
        parent_id: input.parentId ?? null,
        label: input.label ?? null,
        position: input.position ?? 0,
        grid_col: clampGrid(input.gridCol) ?? null,
        grid_row: clampGrid(input.gridRow) ?? null,
        col_span: clampSpan(input.colSpan) ?? 1,
        min_access: input.minAccess && isAccess(input.minAccess) ? input.minAccess : 'visitor',
        staff_domain: cleanStaffDomain(input.staffDomain),
        staff_level: cleanStaffLevel(input.staffLevel),
        icon: input.icon ?? null,
        blurb: input.blurb ?? null,
      })
      .select('id')
      .limit(1)
    if (error) return { ok: false, error: error.message }
    const id = (data ?? [])[0]?.id
    if (!id) return { ok: false, error: 'Insert returned no row' }
    revalidatePath('/', 'layout')
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'createCategory failed' }
  }
}

export type UpdateCategoryPatch = {
  label?: string | null
  position?: number
  parentId?: string | null
  gridCol?: number | null
  gridRow?: number | null
  colSpan?: number
  minAccess?: MenuAccess
  staffDomain?: StaffDomain | null
  staffLevel?: Access | null
  icon?: string | null
  blurb?: string | null
}

export async function updateCategory(id: string, patch: UpdateCategoryPatch): Promise<Result> {
  try {
    await requireJanitor()
    if (!id) return { ok: false, error: 'Missing category id' }
    const update: Record<string, unknown> = {}
    if ('label' in patch) update.label = patch.label ?? null
    if (patch.position != null) update.position = Math.trunc(patch.position)
    if ('parentId' in patch) update.parent_id = patch.parentId ?? null
    if ('gridCol' in patch) update.grid_col = clampGrid(patch.gridCol) ?? null
    if ('gridRow' in patch) update.grid_row = clampGrid(patch.gridRow) ?? null
    if (patch.colSpan != null) update.col_span = clampSpan(patch.colSpan)
    if (patch.minAccess != null && isAccess(patch.minAccess)) update.min_access = patch.minAccess
    if ('staffDomain' in patch) update.staff_domain = cleanStaffDomain(patch.staffDomain)
    if ('staffLevel' in patch) update.staff_level = cleanStaffLevel(patch.staffLevel)
    if ('icon' in patch) update.icon = patch.icon ?? null
    if ('blurb' in patch) update.blurb = patch.blurb ?? null
    if (Object.keys(update).length === 0) return { ok: true }

    const db = adminDb()
    const { error } = await db.from('menu_categories').update(update).eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'updateCategory failed' }
  }
}

export async function deleteCategory(id: string): Promise<Result> {
  try {
    await requireJanitor()
    if (!id) return { ok: false, error: 'Missing category id' }
    const db = adminDb()
    // Child categories + items cascade via the FK on delete.
    const { error } = await db.from('menu_categories').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'deleteCategory failed' }
  }
}

// ── Items ─────────────────────────────────────────────────────────────────────

export type CreateItemInput = {
  menuId: string
  categoryId?: string | null
  label: string
  href: string
  subheading?: string | null
  icon?: string | null
  position?: number
  gridCol?: number | null
  gridRow?: number | null
  colSpan?: number
  mode?: MenuMode
  roleModes?: Record<string, MenuMode>
  minAccess?: MenuAccess
  staffDomain?: StaffDomain | null
  staffLevel?: Access | null
  ghostTier?: string | null
  ghostMessage?: string | null
}

export async function createItem(input: CreateItemInput): Promise<EnsureResult> {
  try {
    await requireJanitor()
    if (!input?.menuId) return { ok: false, error: 'Missing menu id' }
    if (!input.label || !input.href) return { ok: false, error: 'Label and href are required' }
    if (input.mode != null && !isMode(input.mode)) return { ok: false, error: 'Invalid mode' }
    if (input.minAccess != null && !isAccess(input.minAccess))
      return { ok: false, error: 'Invalid min access' }

    const db = adminDb()
    const { data, error } = await db
      .from<{ id: string }>('menu_items')
      .insert({
        menu_id: input.menuId,
        category_id: input.categoryId ?? null,
        label: input.label,
        href: input.href,
        subheading: input.subheading ?? null,
        icon: input.icon ?? null,
        position: input.position ?? 0,
        grid_col: clampGrid(input.gridCol) ?? null,
        grid_row: clampGrid(input.gridRow) ?? null,
        col_span: clampSpan(input.colSpan) ?? 1,
        mode: input.mode ?? 'active',
        role_modes: sanitizeRoleModes(input.roleModes),
        min_access: input.minAccess ?? 'visitor',
        staff_domain: cleanStaffDomain(input.staffDomain),
        staff_level: cleanStaffLevel(input.staffLevel),
        ghost_tier: input.ghostTier ?? null,
        ghost_message: input.ghostMessage ?? null,
      })
      .select('id')
      .limit(1)
    if (error) return { ok: false, error: error.message }
    const id = (data ?? [])[0]?.id
    if (!id) return { ok: false, error: 'Insert returned no row' }
    revalidatePath('/', 'layout')
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'createItem failed' }
  }
}

export type UpdateItemPatch = {
  label?: string
  href?: string
  subheading?: string | null
  icon?: string | null
  position?: number
  categoryId?: string | null
  gridCol?: number | null
  gridRow?: number | null
  colSpan?: number
  mode?: MenuMode
  roleModes?: Record<string, MenuMode>
  minAccess?: MenuAccess
  staffDomain?: StaffDomain | null
  staffLevel?: Access | null
  ghostTier?: string | null
  ghostMessage?: string | null
}

export async function updateItem(id: string, patch: UpdateItemPatch): Promise<Result> {
  try {
    await requireJanitor()
    if (!id) return { ok: false, error: 'Missing item id' }
    if (patch.mode != null && !isMode(patch.mode)) return { ok: false, error: 'Invalid mode' }
    if (patch.minAccess != null && !isAccess(patch.minAccess))
      return { ok: false, error: 'Invalid min access' }

    const update: Record<string, unknown> = {}
    if (patch.label != null) update.label = patch.label
    if (patch.href != null) update.href = patch.href
    if ('subheading' in patch) update.subheading = patch.subheading ?? null
    if ('icon' in patch) update.icon = patch.icon ?? null
    if (patch.position != null) update.position = Math.trunc(patch.position)
    if ('categoryId' in patch) update.category_id = patch.categoryId ?? null
    if ('gridCol' in patch) update.grid_col = clampGrid(patch.gridCol) ?? null
    if ('gridRow' in patch) update.grid_row = clampGrid(patch.gridRow) ?? null
    if (patch.colSpan != null) update.col_span = clampSpan(patch.colSpan)
    if (patch.mode != null) update.mode = patch.mode
    if (patch.roleModes != null) update.role_modes = sanitizeRoleModes(patch.roleModes)
    if (patch.minAccess != null) update.min_access = patch.minAccess
    if ('staffDomain' in patch) update.staff_domain = cleanStaffDomain(patch.staffDomain)
    if ('staffLevel' in patch) update.staff_level = cleanStaffLevel(patch.staffLevel)
    if ('ghostTier' in patch) update.ghost_tier = patch.ghostTier ?? null
    if ('ghostMessage' in patch) update.ghost_message = patch.ghostMessage ?? null
    if (Object.keys(update).length === 0) return { ok: true }

    const db = adminDb()
    const { error } = await db.from('menu_items').update(update).eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'updateItem failed' }
  }
}

export async function deleteItem(id: string): Promise<Result> {
  try {
    await requireJanitor()
    if (!id) return { ok: false, error: 'Missing item id' }
    const db = adminDb()
    const { error } = await db.from('menu_items').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'deleteItem failed' }
  }
}

/** Move a LINK to another container (ADR-390 "put any page anywhere"). Ensures the dest
 *  menu exists, then re-stamps the item's menu_id, drops it to the dest TOP LEVEL
 *  (category_id null), and appends it. The operator can then drag it into a group within
 *  that surface. Janitor-gated. */
export async function moveItem(id: string, surfaceKey: MenuSurfaceKey): Promise<Result> {
  try {
    await requireJanitor()
    if (!id) return { ok: false, error: 'Missing item id' }
    if (!isSurface(surfaceKey)) return { ok: false, error: 'Unknown surface' }
    const ensured = await ensureMenu(surfaceKey)
    if (!ensured.ok) return { ok: false, error: ensured.error }
    const db = adminDb()
    // Append to the end of the dest top level.
    const existing = await db
      .from<{ id: string }>('menu_items')
      .select('id')
      .eq('menu_id', ensured.id)
      .is('category_id', null)
    const position = (existing.data ?? []).length
    const { error } = await db
      .from('menu_items')
      .update({ menu_id: ensured.id, category_id: null, position })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'moveItem failed' }
  }
}

/** Move a CATEGORY (group) and its whole subtree to another container. menu_items carry
 *  menu_id INDEPENDENTLY of category_id, so every descendant category AND item must be
 *  re-stamped with the dest menu_id or they orphan (wrong menu_id → invisible). The moved
 *  root category drops to the dest TOP LEVEL (parent_id null) and appends. Janitor-gated. */
export async function moveCategory(id: string, surfaceKey: MenuSurfaceKey): Promise<Result> {
  try {
    await requireJanitor()
    if (!id) return { ok: false, error: 'Missing category id' }
    if (!isSurface(surfaceKey)) return { ok: false, error: 'Unknown surface' }
    const ensured = await ensureMenu(surfaceKey)
    if (!ensured.ok) return { ok: false, error: ensured.error }
    const db = adminDb()

    // Collect the moved category + all descendant categories (BFS over parent_id).
    const catIds: string[] = [id]
    let frontier: string[] = [id]
    while (frontier.length > 0) {
      const res = await db
        .from<{ id: string }>('menu_categories')
        .select('id')
        .in('parent_id', frontier)
      const next = (res.data ?? []).map((r) => r.id).filter((cid) => !catIds.includes(cid))
      catIds.push(...next)
      frontier = next
    }

    // Re-stamp menu_id on every category in the subtree and every item under those
    // categories, so nothing is left pointing at the old menu.
    const upCats = await db.from('menu_categories').update({ menu_id: ensured.id }).in('id', catIds)
    if (upCats.error) return { ok: false, error: upCats.error.message }
    const upItems = await db.from('menu_items').update({ menu_id: ensured.id }).in('category_id', catIds)
    if (upItems.error) return { ok: false, error: upItems.error.message }

    // Drop the moved ROOT category to the dest top level + append (descendants keep their
    // parent_id, all now within the re-stamped subtree).
    const existing = await db
      .from<{ id: string }>('menu_categories')
      .select('id')
      .eq('menu_id', ensured.id)
      .is('parent_id', null)
    const position = (existing.data ?? []).filter((r) => r.id !== id).length
    const { error } = await db
      .from('menu_categories')
      .update({ parent_id: null, position })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'moveCategory failed' }
  }
}

/** Bulk position / parent update for drag-and-drop reordering. Each update sets at
 *  least a new position; category_id and grid placement are optional. */
export async function reorderItems(
  updates: { id: string; position: number; category_id?: string | null; grid_col?: number | null; grid_row?: number | null }[],
): Promise<Result> {
  try {
    await requireJanitor()
    if (!Array.isArray(updates) || updates.length === 0) return { ok: true }

    const db = adminDb()
    for (const u of updates) {
      if (!u?.id) continue
      const update: Record<string, unknown> = { position: Math.trunc(u.position ?? 0) }
      if ('category_id' in u) update.category_id = u.category_id ?? null
      if ('grid_col' in u) update.grid_col = clampGrid(u.grid_col) ?? null
      if ('grid_row' in u) update.grid_row = clampGrid(u.grid_row) ?? null
      const { error } = await db.from('menu_items').update(update).eq('id', u.id)
      if (error) return { ok: false, error: error.message }
    }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'reorderItems failed' }
  }
}

// ── Rail cards ──────────────────────────────────────────────────────────────

export type CreateRailCardInput = {
  menuId: string
  side: 'left' | 'right'
  title: string
  body: string
  href: string
  cta?: string | null
  position?: number
  mode?: MenuMode
  roleModes?: Record<string, MenuMode>
}

export async function createRailCard(input: CreateRailCardInput): Promise<EnsureResult> {
  try {
    await requireJanitor()
    if (!input?.menuId) return { ok: false, error: 'Missing menu id' }
    if (!(SIDE_VALUES as readonly string[]).includes(input.side))
      return { ok: false, error: 'Invalid side' }
    if (!input.title || !input.body || !input.href)
      return { ok: false, error: 'Title, body, and href are required' }
    if (input.mode != null && !isMode(input.mode)) return { ok: false, error: 'Invalid mode' }

    const db = adminDb()
    const { data, error } = await db
      .from<{ id: string }>('menu_rail_cards')
      .insert({
        menu_id: input.menuId,
        side: input.side,
        title: input.title,
        body: input.body,
        href: input.href,
        cta: input.cta ?? null,
        position: input.position ?? 0,
        mode: input.mode ?? 'active',
        role_modes: sanitizeRoleModes(input.roleModes),
      })
      .select('id')
      .limit(1)
    if (error) return { ok: false, error: error.message }
    const id = (data ?? [])[0]?.id
    if (!id) return { ok: false, error: 'Insert returned no row' }
    revalidatePath('/', 'layout')
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'createRailCard failed' }
  }
}

export type UpdateRailCardPatch = {
  side?: 'left' | 'right'
  title?: string
  body?: string
  href?: string
  cta?: string | null
  position?: number
  mode?: MenuMode
  roleModes?: Record<string, MenuMode>
}

export async function updateRailCard(id: string, patch: UpdateRailCardPatch): Promise<Result> {
  try {
    await requireJanitor()
    if (!id) return { ok: false, error: 'Missing rail card id' }
    if (patch.side != null && !(SIDE_VALUES as readonly string[]).includes(patch.side))
      return { ok: false, error: 'Invalid side' }
    if (patch.mode != null && !isMode(patch.mode)) return { ok: false, error: 'Invalid mode' }

    const update: Record<string, unknown> = {}
    if (patch.side != null) update.side = patch.side
    if (patch.title != null) update.title = patch.title
    if (patch.body != null) update.body = patch.body
    if (patch.href != null) update.href = patch.href
    if ('cta' in patch) update.cta = patch.cta ?? null
    if (patch.position != null) update.position = Math.trunc(patch.position)
    if (patch.mode != null) update.mode = patch.mode
    if (patch.roleModes != null) update.role_modes = sanitizeRoleModes(patch.roleModes)
    if (Object.keys(update).length === 0) return { ok: true }

    const db = adminDb()
    const { error } = await db.from('menu_rail_cards').update(update).eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'updateRailCard failed' }
  }
}

export async function deleteRailCard(id: string): Promise<Result> {
  try {
    await requireJanitor()
    if (!id) return { ok: false, error: 'Missing rail card id' }
    const db = adminDb()
    const { error } = await db.from('menu_rail_cards').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'deleteRailCard failed' }
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

/** Upsert the singleton menu_settings row (id = 1), clamping each value to its
 *  CHECK range. Omitted fields keep their existing value (a partial patch). */
export async function setMenuSettings(patch: Partial<MenuSettings>): Promise<Result> {
  try {
    const caller = await requireJanitor()
    const db = adminDb()

    // Read current values so an omitted field is preserved on upsert.
    const { data } = await db
      .from<{ open_delay_ms: number; dwell_ms: number; fade_ms: number }>('menu_settings')
      .select('open_delay_ms, dwell_ms, fade_ms')
      .eq('id', 1)
      .limit(1)
    const current = (data ?? [])[0]

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.trunc(v)))
    const openDelayMs = clamp(
      patch.openDelayMs ?? current?.open_delay_ms ?? DEFAULT_MENU_SETTINGS.openDelayMs,
      0,
      2000,
    )
    const dwellMs = clamp(
      patch.dwellMs ?? current?.dwell_ms ?? DEFAULT_MENU_SETTINGS.dwellMs,
      0,
      10000,
    )
    const fadeMs = clamp(patch.fadeMs ?? current?.fade_ms ?? DEFAULT_MENU_SETTINGS.fadeMs, 0, 3000)

    const { error } = await db.from('menu_settings').upsert(
      {
        id: 1,
        open_delay_ms: openDelayMs,
        dwell_ms: dwellMs,
        fade_ms: fadeMs,
        updated_at: new Date().toISOString(),
        updated_by: caller.id,
      },
      { onConflict: 'id' },
    )
    if (error) return { ok: false, error: error.message }

    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'setMenuSettings failed' }
  }
}
