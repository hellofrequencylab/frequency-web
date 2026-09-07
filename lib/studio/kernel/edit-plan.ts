// ─────────────────────────────────────────────────────────────────────────────
// THE EDIT PLAN: the edit-side half of the ADR-450 seam (docs/EDITING-SYSTEM.md §2, ADR-1240).
//
// `sparkFields()` has driven every Spark since ADR-986. Its two siblings, `inlineFields()` and
// `railFields()`, sat in review-kernel.ts with no production consumer (HYG-050): the Inspector
// rail hand-declared its fields, so a manifest could say `inline` while the rail rendered the
// field anyway, and nothing noticed. This module is what a rail module calls instead of writing
// a field list of its own.
//
// THE ONE THING A RAIL FORM MAY SAY FOR ITSELF is which columns its save action persists
// (`writes`). That is the server's own column list restated once where a test can hold it
// against the manifest. Everything else, the field SET, its ORDER, each label, kind, options,
// and whether it is required, is the manifest's, filtered by placement.
//
// PURE + entity-blind, like the rest of the kernel: no React, no Next, no Supabase, and never an
// import from lib/studio/entities. A rail module hands in the manifest it was given.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldDef } from './manifest'
import { inlineFields, railFields } from './review-kernel'

/** Both edit planes of one manifest, from placement alone (ADR-450 §2). */
export interface EditPlan {
  /** Content that IS the page, edited in place on the live entity. */
  inline: FieldDef[]
  /** Configuration, edited in the Inspector rail. The default placement. */
  rail: FieldDef[]
}

/** The edit planes of a manifest. ONE list, split two ways, in manifest order. */
export function editPlan(manifest: EntityManifest): EditPlan {
  return { inline: inlineFields(manifest), rail: railFields(manifest) }
}

/**
 * Why a written column did not become a rail field. Every reason is a drift the old hand list
 * hid: an `unknown` path is a column the manifest never declared; an `inline` path belongs on
 * the canvas and the rail is not hosting it; a `spark-only` path is asked at creation and is on
 * no edit plane at all.
 */
export type RailDropReason = 'unknown' | 'inline' | 'spark-only'

export interface RailForm {
  /** The fields the form renders, in MANIFEST order. */
  fields: FieldDef[]
  /** Written columns the plan could not honour, so a test can pin "nothing dropped" per form. */
  dropped: { path: string; reason: RailDropReason }[]
}

export interface RailFormOptions {
  /**
   * An entity with no inline canvas yet renders its inline plane in the rail too. The fields keep
   * their `inline` placement; the rail is only where they render until the canvas lands, and
   * dropping this flag is the whole change when it does.
   */
  hostInline?: boolean
}

/**
 * The fields ONE rail form renders: the manifest's rail plane (plus its inline plane when the rail
 * is hosting it), restricted to the columns the form's save action writes. Top-level fields only:
 * a rail form persists columns, and a repeat is a table of rows with its own editor.
 */
export function railForm(
  manifest: EntityManifest,
  writes: readonly string[],
  opts: RailFormOptions = {},
): RailForm {
  const wanted = new Set(writes)
  const inline = new Set(inlineFields(manifest).map((f) => f.path))
  const rail = new Set(railFields(manifest).map((f) => f.path))
  const declared = new Set(manifest.fields.map((f) => f.path))

  const fields = manifest.fields.filter(
    (f) => wanted.has(f.path) && (rail.has(f.path) || (opts.hostInline === true && inline.has(f.path))),
  )
  const kept = new Set(fields.map((f) => f.path))

  const dropped: RailForm['dropped'] = []
  for (const path of writes) {
    if (kept.has(path)) continue
    if (!declared.has(path)) dropped.push({ path, reason: 'unknown' })
    else if (inline.has(path)) dropped.push({ path, reason: 'inline' })
    else dropped.push({ path, reason: 'spark-only' })
  }

  return { fields, dropped }
}
