import { entityBlockById, blockSupportsKind, type EntityKind } from './registry'
import {
  isTemplateId,
  slotIds,
  defaultSlotId,
  DEFAULT_TEMPLATE,
  type TemplateId,
} from '@/lib/widgets/templates'

// The GRID layout model for the unified entity-block system (ADR-508, U2b). Generalizes S3's
// single-column SavedProfileLayout (lib/spaces/profile-layout.ts, {order?,hidden?}) to carry a GRID: a
// TEMPLATE (from the module-engine template catalog) plus a per-SLOT ordered list of block ids. ONE
// model drives both a member (Spotlight) and a space (Spaces) grid editor, so the shared block-picker
// (components/entity-blocks/block-grid-editor.tsx) reads one shape. PURE + framework-independent (no
// React / Next / Supabase), so it is trivially unit-testable, like its S3 sibling.
//
// BACK-COMPATIBLE: a flat `order?: string[]` still works — it reads as the default slot of the Single
// template, so a value saved before the grid landed keeps rendering. FAIL-SAFE throughout: a malformed
// blob parses to null and the fresh default stands, so a bad row never breaks a profile.

/** The operator's saved GRID arrangement, persisted per surface (space → spaces.preferences.profileLayout,
 *  member → profiles.meta). Every key optional so a partial blob is valid. */
export interface EntityLayout {
  /** The interior template (which slots exist). Absent = the single-column default. */
  template?: TemplateId
  /** Slot id (e.g. 'main','side','top','col-1') → the ordered block ids placed in it. */
  slots?: Record<string, string[]>
  /** Block ids toggled off (dropped from the render). */
  hidden?: string[]
  /** Back-compat single-column fallback: a flat ordered id list = the default slot. */
  order?: string[]
}

/** Keep only the string entries of an unknown array; a non-array yields []. */
function strArr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

/**
 * Fail-safe read of a saved grid layout node. Accepts the grid shape ({template,slots,hidden}) AND the
 * flat back-compat shape ({order}). Returns null for anything that is not a plain object, or an object
 * that carries none of the recognised keys — so a wrong shape reads as "no saved layout" and the fresh
 * default stands. Pure + total: an unusable value is dropped, never thrown.
 */
export function parseEntityLayout(raw: unknown): EntityLayout | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as { template?: unknown; slots?: unknown; hidden?: unknown; order?: unknown }
  const out: EntityLayout = {}

  if (isTemplateId(o.template)) out.template = o.template

  if (o.slots && typeof o.slots === 'object' && !Array.isArray(o.slots)) {
    const slots: Record<string, string[]> = {}
    for (const [slotId, ids] of Object.entries(o.slots as Record<string, unknown>)) {
      const clean = strArr(ids)
      if (clean.length) slots[slotId] = clean
    }
    if (Object.keys(slots).length) out.slots = slots
  }

  const hidden = strArr(o.hidden)
  if (hidden.length) out.hidden = hidden

  const order = strArr(o.order)
  if (order.length) out.order = order

  return Object.keys(out).length ? out : null
}

/**
 * Resolve the EFFECTIVE grid a surface renders, given the fresh-default ordered ids and the operator's
 * saved edits. Slot-aware mirror of S3's mergeProfileLayout. RULES:
 *   • only ids valid for the kind survive (drop a retired block, or one that does not support the kind);
 *   • `hidden` ids are dropped from every slot;
 *   • the template is the saved one (when valid), else the single-column default;
 *   • saved ids keep their slot when that slot exists in the template; an id in a slot the template no
 *     longer has falls into the default slot; a flat saved `order` reads as the default slot;
 *   • any default id the saved layout never placed (a new block, or one left untouched) is APPENDED to
 *     the default slot, so a newly added block shows up without re-opening the editor.
 * The returned slots contain ONLY visible, placed, valid ids. FAIL-SAFE: a null saved layout returns the
 * fresh default arranged in the single-column template's default slot.
 */
export function mergeEntityLayout(
  defaultIds: string[],
  saved: EntityLayout | null,
  kind: EntityKind,
): EntityLayout {
  // The universe of ids valid for this kind (drop retired / wrong-kind ids up front).
  const valid = defaultIds.filter((id) => {
    const block = entityBlockById(id)
    return block !== null && blockSupportsKind(block, kind)
  })
  const validSet = new Set(valid)

  const savedTemplate = saved?.template
  const template: TemplateId = isTemplateId(savedTemplate) ? savedTemplate : DEFAULT_TEMPLATE
  const templateSlots = slotIds(template)
  const def = defaultSlotId(template)
  const hidden = new Set((saved?.hidden ?? []).filter((id) => validSet.has(id)))

  // Seed the saved arrangement: prefer saved.slots; else a flat saved.order (→ default slot); else none.
  const savedSlots: Record<string, string[]> =
    saved?.slots ?? (saved?.order ? { [def]: saved.order } : {})

  const placed = new Set<string>()
  const out: Record<string, string[]> = {}
  const place = (slot: string, id: string) => {
    if (placed.has(id) || hidden.has(id) || !validSet.has(id)) return
    placed.add(id)
    ;(out[slot] ??= []).push(id)
  }

  // 1. Saved ids whose slot exists in this template, in template-slot order.
  for (const slot of templateSlots) for (const id of savedSlots[slot] ?? []) place(slot, id)
  // 2. Orphaned saved ids (a slot the template no longer has) fall into the default slot.
  for (const [slot, ids] of Object.entries(savedSlots)) {
    if (templateSlots.includes(slot)) continue
    for (const id of ids) place(def, id)
  }
  // 3. Append any remaining valid default id (new / untouched, not hidden) to the default slot.
  for (const id of valid) place(def, id)

  return { template, slots: out, hidden: [...hidden] }
}

/**
 * Server-side WRITE guard: keep only ids valid for the kind (drop a retired / wrong-kind id), de-duped
 * across the whole layout so a block never lands in two slots. Mirrors the S3 action's sanitizeIds but
 * slot-aware. Returns null when nothing usable survives (the caller clears the saved node). Never trusts
 * the wire.
 */
export function sanitizeEntityLayout(raw: unknown, kind: EntityKind): EntityLayout | null {
  const parsed = parseEntityLayout(raw)
  if (!parsed) return null
  const seen = new Set<string>()
  const keep = (id: string): boolean => {
    if (seen.has(id)) return false
    const block = entityBlockById(id)
    if (block === null || !blockSupportsKind(block, kind)) return false
    seen.add(id)
    return true
  }
  const out: EntityLayout = {}
  if (isTemplateId(parsed.template)) out.template = parsed.template
  if (parsed.slots) {
    const slots: Record<string, string[]> = {}
    for (const [slot, ids] of Object.entries(parsed.slots)) {
      const clean = ids.filter(keep)
      if (clean.length) slots[slot] = clean
    }
    if (Object.keys(slots).length) out.slots = slots
  }
  // `order` shares the same de-dupe universe as slots (it is an alternate placement source).
  if (parsed.order) {
    const clean = parsed.order.filter(keep)
    if (clean.length) out.order = clean
  }
  if (parsed.hidden) {
    // Hidden ids are validated independently (they are not placements, so they do not consume `seen`).
    const clean = parsed.hidden.filter((id) => {
      const block = entityBlockById(id)
      return block !== null && blockSupportsKind(block, kind)
    })
    if (clean.length) out.hidden = [...new Set(clean)]
  }
  return Object.keys(out).length ? out : null
}

/** The visible block ids of a resolved layout, per slot, in the template's slot order. A convenience for
 *  a renderer: pass the OUTPUT of mergeEntityLayout (or a hand-built EntityLayout with a template). */
export function layoutSlots(layout: EntityLayout): Array<{ slot: string; ids: string[] }> {
  const template = isTemplateId(layout.template) ? layout.template : DEFAULT_TEMPLATE
  const def = defaultSlotId(template)
  const slots = layout.slots ?? (layout.order ? { [def]: layout.order } : {})
  return slotIds(template).map((slot) => ({ slot, ids: slots[slot] ?? [] }))
}
