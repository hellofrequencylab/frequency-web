// ─────────────────────────────────────────────────────────────────────────────
// THE CIRCLE RAIL'S PLAN (ADR-450 §2 · ADR-1240 · ADR-1281 · HYG-050).
//
// The Circle settings module used to declare its fields by hand: ten labelled controls, each with
// its own label, kind, options, and order, beside a manifest that declared six of them with
// different words and did not declare the other four at all (the cover, the status, the listing
// switch, the access mode, and the Channel). One of those hand-written options, a "Paused" status,
// is not a value the `group_status` enum accepts, so picking it failed at the database. Nothing
// compared the two. Now the module renders THIS, and this is CIRCLE_MANIFEST filtered through the
// kernel's edit plan.
//
// What this file says for itself is the SAVE PATHS and the TRANSLATION. The Circle's columns are
// snake_case where the manifest's paths are camelCase (`member_cap` for `memberCap`), and the
// settings action reads FormData, so beside each zone's `writes` sits the column-to-path map
// ADR-1240 said every converted rail would need, restated once where a test can hold it against
// the action. Everything a field IS, its label, its kind, its options, whether it is required, and
// where it falls in the order, is the manifest's, read through `railForm()`.
//
// THE ZONES are the rail's save paths:
//   cover      setCircleCoverUrl / removeCircleCover   self-saving through the Loom
//   settings   updateCircleSettings                   the autosave form, FormData keyed by column
//   access     setCircleAccessAction                  its own action: the save can be REFUSED
//   channel    setCircleChannelAction                 its own action, for the same reason
//   permalink  updateCirclePermalink                  its own action: a rename redirects the page
//
// HOSTING THE INLINE PLANE. The manifest places `about` on the inline canvas (it is the content of
// the page). No inline canvas exists on /circles/[slug] yet, so the rail hosts it (`hostInline`).
// Dropping that flag is the whole change when the canvas lands. The `name` is asked at creation
// and edited here after, which the manifest now says with `editPlane: 'rail'` (ADR-1281).
//
// PURE: the manifest and the kernel only. The module and its test both import this, so the test
// pins what the rail renders without mounting a client module that reaches server actions.
// ─────────────────────────────────────────────────────────────────────────────

import { CIRCLE_MANIFEST } from '@/lib/studio/entities/circle'
import { railForm, type RailForm } from '@/lib/studio/kernel/edit-plan'
import type { FieldDef } from '@/lib/studio/kernel/manifest'

/** The column `setCircleCoverUrl` / `removeCircleCover` write. */
export const CIRCLE_COVER_WRITES = ['imageUrl'] as const

/** The columns `updateCircleSettings` writes, as the action reads them off its FormData. */
export const CIRCLE_SETTINGS_WRITES = ['name', 'about', 'type', 'memberCap', 'status', 'unlisted'] as const

/** The column `setCircleAccessAction` writes. */
export const CIRCLE_ACCESS_WRITES = ['access'] as const

/** The column `setCircleChannelAction` writes. */
export const CIRCLE_CHANNEL_WRITES = ['topicalChannelId'] as const

/** The column `updateCirclePermalink` writes. */
export const CIRCLE_PERMALINK_WRITES = ['slug'] as const

export type CircleRailPath =
  | (typeof CIRCLE_COVER_WRITES)[number]
  | (typeof CIRCLE_SETTINGS_WRITES)[number]
  | (typeof CIRCLE_ACCESS_WRITES)[number]
  | (typeof CIRCLE_CHANNEL_WRITES)[number]
  | (typeof CIRCLE_PERMALINK_WRITES)[number]

/**
 * THE COLUMN-TO-PATH MAP. The `circles` column each rail path persists to. This is the one
 * further fact the rail knows beside its writes: the dialect its server speaks (ADR-1246).
 */
export const CIRCLE_COLUMNS: Record<CircleRailPath, string> = {
  imageUrl: 'image_url',
  name: 'name',
  about: 'about',
  type: 'type',
  memberCap: 'member_cap',
  status: 'status',
  unlisted: 'unlisted',
  access: 'access',
  topicalChannelId: 'topical_channel_id',
  slug: 'slug',
}

export interface CircleRailPlan {
  cover: RailForm
  settings: RailForm
  access: RailForm
  channel: RailForm
  permalink: RailForm
}

export const CIRCLE_RAIL: CircleRailPlan = {
  cover: railForm(CIRCLE_MANIFEST, CIRCLE_COVER_WRITES),
  settings: railForm(CIRCLE_MANIFEST, CIRCLE_SETTINGS_WRITES, { hostInline: true }),
  access: railForm(CIRCLE_MANIFEST, CIRCLE_ACCESS_WRITES),
  channel: railForm(CIRCLE_MANIFEST, CIRCLE_CHANNEL_WRITES),
  permalink: railForm(CIRCLE_MANIFEST, CIRCLE_PERMALINK_WRITES),
}

/** Every field the rail renders, in manifest order, across all zones. */
export function circleRailFields(): FieldDef[] {
  const paths = new Set<string>()
  for (const zone of Object.values(CIRCLE_RAIL) as RailForm[]) for (const f of zone.fields) paths.add(f.path)
  return CIRCLE_MANIFEST.fields.filter((f: FieldDef) => paths.has(f.path))
}

// ── Reading the row into the rail's values ───────────────────────────────────────────────

/** The rail's values: one control string per manifest path. Absent reads as empty. */
export type CircleRailValues = Record<string, string>

/** Render a stored value as the control's string. A toggle reads `'true'` / `'false'`, the kit's own
 *  encoding, so a boolean column round-trips through the checkbox. */
function display(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/**
 * The rail's initial values from a `circles` row keyed by COLUMN (what `getCircleAdminData` returns).
 * Each field is read through its column, then a field with a `read` uses it against a view keyed by
 * manifest path, so the manifest's own defaults (12 members, `draft`, `open`) are what an unset
 * column shows; everything else reads the scalar.
 */
export function circleRailValues(row: Record<string, unknown>): CircleRailValues {
  const view: Record<string, unknown> = {}
  for (const f of circleRailFields()) view[f.path] = row[CIRCLE_COLUMNS[f.path as CircleRailPath]]
  const out: CircleRailValues = {}
  for (const f of circleRailFields()) out[f.path] = f.read ? f.read(view) : display(view[f.path])
  return out
}

// ── The settings form's FormData, keyed by column ─────────────────────────────────────────

/**
 * `updateCircleSettings`' FormData from the rail's values: every settings column, keyed the way the
 * action reads it. Built from the values rather than snapshotted off the form because a native
 * checkbox is ABSENT from a FormData when unchecked, and the action writes `unlisted` only when the
 * field is present (`'on'` / `'off'`), so a snapshot could never switch a Circle back to Listed.
 * That is why the old rail drew the switch as a select; the plan encodes it once, here.
 */
export function circleSettingsFormData(values: CircleRailValues): FormData {
  const fd = new FormData()
  for (const path of CIRCLE_SETTINGS_WRITES) {
    const kind = CIRCLE_MANIFEST.fields.find((f) => f.path === path)?.kind
    const v = values[path] ?? ''
    fd.set(CIRCLE_COLUMNS[path], kind === 'toggle' ? (v === 'true' ? 'on' : 'off') : v)
  }
  return fd
}
