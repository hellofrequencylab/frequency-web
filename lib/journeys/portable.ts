// Portable Journey — the federated export/import contract (the keystone of the
// Frequency⇄Hook integration). A Journey is the unit of value both products trade in:
// in Frequency it is a `journey_plans` row + its `journey_plan_items` block tree
// (Phase → Module → Lesson); in Hook it is a `courses` row + its modules → lessons.
// This module is the ONE place that defines a versioned, self-describing JSON shape a
// Journey serializes to, so a Journey is interchangeable across Frequency Spaces today
// and (by the same contract) Hook cohort communities tomorrow.
//
// PURE: no IO, no DB, no cross-DB code. `toPortable` serializes a plan + its rows;
// `fromPortable` produces the plan fields + ordered flat rows the EXISTING create path
// (app/(main)/journeys/create-actions.ts) already consumes. We never write our own DB
// writes or migrations — `fromPortable` returns the same { tempId, parentTempId,
// blockType, …, sortOrder } shape the template/master-framework importers feed to
// `journey_plan_items` inserts (parents before children, tempIds resolved to real ids).
//
// ─────────────────────────────────────────────────────────────────────────────────────
// FREQUENCY ⇄ HOOK FIELD MAPPING (the federated contract)
// ─────────────────────────────────────────────────────────────────────────────────────
// PortableJourney is the neutral middle. Each side maps to/from it:
//
//   PortableJourney        Frequency (journey_plans / _items)   Hook (courses / modules / lessons)
//   ─────────────────────  ──────────────────────────────────  ──────────────────────────────────
//   schema_version         (n/a — contract version)            (n/a — contract version)
//   title                  journey_plans.title                 courses.title
//   summary                journey_plans.summary               courses.description
//   drip_interval_days     journey_plans.drip_interval_days    lessons.drip_days_after_enrollment*
//   items[] (tree)         journey_plan_items (flat + parent)   modules[] → lessons[]
//
//   Item node              journey_plan_items column            Hook node / column
//   ─────────────────────  ──────────────────────────────────  ──────────────────────────────────
//   kind: 'phase'          block_type='phase' (container)      (no Hook peer — flattened into modules)
//   kind: 'module'         block_type='module' (container)     ModuleNode
//   kind: 'lesson'         block_type=<leaf type> (see below)  LessonNode
//   title                  title                               title
//   note                   body (markdown lesson copy)         content_body
//   est_minutes            est_minutes                         (no direct peer; carry in metadata)
//   required               required                            (Hook gates by drip/tier, not required)
//   block_type (leaf)      block_type                          content_type (see lesson-type map)
//   sort_order (implicit)  sort_order                          position
//
//   * drip is per-Journey in Frequency (one cadence for the whole plan) but per-lesson in
//     Hook (drip_days_after_enrollment). Export carries the single plan-level cadence;
//     a Hook importer derives each lesson's offset from it (e.g. phaseIndex *
//     drip_interval_days). We keep the lossless plan-level value and leave the per-lesson
//     fan-out to the importing side.
//
// LESSON BLOCK_TYPE ⇄ HOOK content_type
//   Frequency leaf block_type            Hook content_type
//   ───────────────────────────────────  ─────────────────
//   video                                video
//   reading                              text
//   lesson | exercise | reflection       text
//   resource                             file
//   check                                quiz
//   practice                             text   (a real-world practice has no Hook peer;
//                                                 it serializes as a text lesson so the
//                                                 course stays whole, and round-trips back
//                                                 to a Frequency practice via block_type)
// ─────────────────────────────────────────────────────────────────────────────────────

import type { JourneyPlan } from '@/lib/journey-plans'

/** The contract version. Bump on any breaking shape change; importers branch on it. */
export const PORTABLE_SCHEMA_VERSION = 1 as const

/** Hook's content_type union (mirror of hook/types/database.ts `ContentType`). Kept here as a
 *  local literal so this module stays dependency-free — Frequency must not import Hook code. */
export type HookContentType = 'video' | 'text' | 'file' | 'quiz'

/** The block_type a portable LEAF (lesson) can carry — the Frequency leaf set (containers
 *  'phase'/'module' are expressed by the node `kind`, never here). 'section' is the legacy
 *  alias kept for back-compat with pre-v2 rows. */
export type PortableLeafType =
  | 'lesson' | 'video' | 'reading' | 'exercise' | 'reflection' | 'check' | 'resource' | 'practice' | 'section'

/** One node in the portable items tree. A container ('phase'/'module') has children; a 'lesson'
 *  leaf carries the content. The tree mirrors Frequency's Phase → Module → Lesson exactly and
 *  maps cleanly onto Hook's modules → lessons (phases flatten into modules on the Hook side). */
export type PortableItem = PortablePhase | PortableModule | PortableLesson

export interface PortablePhase {
  kind: 'phase'
  title: string
  /** Phase intro copy (journey_plan_items.body). */
  note: string | null
  children: PortableItem[]
}

export interface PortableModule {
  kind: 'module'
  title: string
  note: string | null
  children: PortableLesson[]
}

export interface PortableLesson {
  kind: 'lesson'
  /** The Frequency leaf block_type — the source of truth for round-tripping. */
  block_type: PortableLeafType
  title: string
  /** Markdown lesson copy (journey_plan_items.body). */
  note: string | null
  est_minutes: number | null
  /** Does this leaf gate course completion (journey_plan_items.required). */
  required: boolean
}

/** The versioned, portable JSON a Journey serializes to — the federated contract. */
export interface PortableJourney {
  schema_version: typeof PORTABLE_SCHEMA_VERSION
  title: string
  summary: string | null
  /** Plan-level drip cadence (journey_plans.drip_interval_days ⇄ Hook drip_days_after_enrollment). */
  drip_interval_days: number
  items: PortableItem[]
}

// ── Hook content_type mapping (see the table at the top of this file) ────────────────────────

/** Map a Frequency leaf block_type → Hook content_type. The inverse is lossy (Hook collapses
 *  several Frequency types to 'text'), which is why round-trips inside Frequency carry the real
 *  `block_type`, not the Hook content_type. */
export function leafTypeToHookContentType(blockType: PortableLeafType): HookContentType {
  switch (blockType) {
    case 'video':
      return 'video'
    case 'resource':
      return 'file'
    case 'check':
      return 'quiz'
    case 'reading':
    case 'lesson':
    case 'exercise':
    case 'reflection':
    case 'practice':
    case 'section':
    default:
      return 'text'
  }
}

/** Map a Hook content_type → a Frequency leaf block_type (the best-fit inverse, used when
 *  IMPORTING a Hook course). 'text' lands on the generic 'lesson'. */
export function hookContentTypeToLeafType(contentType: HookContentType): PortableLeafType {
  switch (contentType) {
    case 'video':
      return 'video'
    case 'file':
      return 'resource'
    case 'quiz':
      return 'check'
    case 'text':
    default:
      return 'lesson'
  }
}

/** Per-lesson Hook drip offset derived from the plan-level cadence: a lesson in phase N unlocks
 *  N * drip_interval_days after enrollment. This is the fan-out a Hook importer would apply to
 *  turn Frequency's single plan-level cadence into Hook's per-lesson drip_days_after_enrollment. */
export function hookDripDaysForPhase(phaseIndex: number, dripIntervalDays: number): number {
  return Math.max(0, phaseIndex) * Math.max(0, dripIntervalDays)
}

const CONTAINER_TYPES = new Set(['phase', 'module'])

/** Coerce a stored block_type into a known PortableLeafType (defaults legacy/unknown to 'lesson',
 *  matching tree.ts's leaf handling). */
function asLeafType(blockType: string | null | undefined): PortableLeafType {
  const t = blockType ?? 'practice'
  const known: PortableLeafType[] = [
    'lesson', 'video', 'reading', 'exercise', 'reflection', 'check', 'resource', 'practice', 'section',
  ]
  return (known as string[]).includes(t) ? (t as PortableLeafType) : 'lesson'
}

// ── toPortable: journey_plan + flat item rows → PortableJourney (pure) ────────────────────────

/** A minimal row shape `toPortable` needs — a structural subset of JourneyPlanItem, so any caller
 *  that has the flat `journey_plan_items` rows (the create/edit/read paths all do) can serialize. */
export interface PortableSourceRow {
  id: string
  parent_id?: string | null
  block_type?: string | null
  sort_order: number
  title?: string | null
  body?: string | null
  note?: string | null
  required?: boolean | null
  est_minutes?: number | null
}

/** Serialize a journey_plan + its flat item rows into the versioned PortableJourney tree. Pure: no
 *  IO. Rebuilds the Phase → Module → Lesson nesting from `parent_id`/`sort_order` (the same source
 *  of truth lib/journeys/tree.ts reads), then drops the runtime ids — the portable form is keyed by
 *  STRUCTURE, not by a Space's row ids, so it is interchangeable across Spaces and communities. */
export function toPortable(
  plan: Pick<JourneyPlan, 'title' | 'summary' | 'drip_interval_days'>,
  items: readonly PortableSourceRow[],
): PortableJourney {
  const childrenOf = new Map<string | null, PortableSourceRow[]>()
  for (const row of items) {
    const key = row.parent_id ?? null
    const list = childrenOf.get(key) ?? []
    list.push(row)
    childrenOf.set(key, list)
  }
  for (const list of childrenOf.values()) list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const noteOf = (row: PortableSourceRow): string | null => {
    const v = row.body ?? row.note ?? null
    return v && v.trim() ? v : null
  }

  const toLesson = (row: PortableSourceRow): PortableLesson => ({
    kind: 'lesson',
    block_type: asLeafType(row.block_type),
    title: (row.title ?? '').trim(),
    note: noteOf(row),
    est_minutes: row.est_minutes ?? null,
    required: row.required ?? true,
  })

  const buildChildren = (parentId: string | null): PortableItem[] =>
    (childrenOf.get(parentId) ?? []).map((row) => {
      const bt = row.block_type ?? 'practice'
      if (bt === 'module') {
        const lessons = (childrenOf.get(row.id) ?? [])
          .filter((c) => !CONTAINER_TYPES.has(c.block_type ?? 'practice'))
          .map(toLesson)
        return { kind: 'module', title: (row.title ?? '').trim(), note: noteOf(row), children: lessons }
      }
      if (bt === 'phase') {
        return { kind: 'phase', title: (row.title ?? '').trim(), note: noteOf(row), children: buildChildren(row.id) }
      }
      return toLesson(row)
    })

  return {
    schema_version: PORTABLE_SCHEMA_VERSION,
    title: plan.title,
    summary: plan.summary ?? null,
    drip_interval_days: plan.drip_interval_days,
    // Top-level rows carry parent_id = null (phases, or loose leaves for a flat journey).
    items: buildChildren(null),
  }
}

// ── fromPortable: PortableJourney → plan fields + ordered flat rows for the EXISTING create path ──

/** The plan-identity fields a new Journey is created with. Matches `createPlan`'s input (title +
 *  summary) plus the delivery cadence the create/edit path persists via `updatePlan`. */
export interface PortablePlanFields {
  title: string
  summary: string | null
  dripIntervalDays: number
}

/** One flat block row ready for the EXISTING importer loop (create-actions.ts): inserted in array
 *  order (parents before children), with `parentTempId` resolved to the real inserted id via an
 *  id map — the identical contract `templateToBlocks` / `masterFrameworkToBlocks` already use. */
export interface PortableBlockRow {
  tempId: string
  parentTempId: string | null
  blockType: 'phase' | 'module' | PortableLeafType
  title: string
  body: string | null
  required: boolean
  estMinutes: number | null
  sortOrder: number
}

export interface FromPortableResult {
  plan: PortablePlanFields
  /** Ordered flat rows; insert in order, mapping each tempId → the real inserted id for child refs. */
  blocks: PortableBlockRow[]
}

/** Deserialize a PortableJourney into the plan fields + ordered flat block rows the existing create
 *  path consumes. Pure: no IO, no DB writes — the caller feeds `blocks` to the same insert loop the
 *  template importer uses (see app/(main)/journeys/create-actions.ts). Unknown future schema
 *  versions throw, so an importer fails loud rather than silently dropping fields. */
export function fromPortable(portable: PortableJourney): FromPortableResult {
  if (portable.schema_version !== PORTABLE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported PortableJourney schema_version ${String(portable.schema_version)} (expected ${PORTABLE_SCHEMA_VERSION})`,
    )
  }

  const blocks: PortableBlockRow[] = []
  let seq = 0
  const nextId = () => `pj-${seq++}`

  const pushLesson = (lesson: PortableLesson, parentTempId: string | null, sortOrder: number) => {
    blocks.push({
      tempId: nextId(),
      parentTempId,
      blockType: lesson.block_type,
      title: lesson.title,
      body: lesson.note,
      required: lesson.required,
      estMinutes: lesson.est_minutes,
      sortOrder,
    })
  }

  const pushNode = (node: PortableItem, parentTempId: string | null, sortOrder: number) => {
    if (node.kind === 'lesson') {
      pushLesson(node, parentTempId, sortOrder)
      return
    }
    const tempId = nextId()
    blocks.push({
      tempId,
      parentTempId,
      blockType: node.kind, // 'phase' | 'module'
      title: node.title,
      body: node.note,
      required: true,
      estMinutes: null,
      sortOrder,
    })
    node.children.forEach((child, i) => pushNode(child, tempId, i))
  }

  portable.items.forEach((node, i) => pushNode(node, null, i))

  return {
    plan: {
      title: portable.title,
      summary: portable.summary ?? null,
      dripIntervalDays: portable.drip_interval_days,
    },
    blocks,
  }
}

// ── Hook projection: PortableJourney → a Hook-shaped course outline (contract demo, pure) ─────
// This is the field-mapping made executable: it projects the neutral PortableJourney onto Hook's
// modules → lessons shape (hook/types/courses.ts), flattening Frequency phases into Hook modules
// and mapping each leaf's block_type to a Hook content_type + per-lesson drip. It returns a plain
// shape (NOT a Hook import) — the federated contract is serialization + mapping only, no cross-DB
// code. A Hook-side importer consumes this; we never reach into Hook's database.

export interface HookLessonOutline {
  title: string
  content_type: HookContentType
  content_body: string | null
  position: number
  drip_days_after_enrollment: number
}

export interface HookModuleOutline {
  title: string
  position: number
  lessons: HookLessonOutline[]
}

export interface HookCourseOutline {
  title: string
  description: string | null
  modules: HookModuleOutline[]
}

/** Project a PortableJourney onto Hook's course → modules → lessons shape. Phases become top-level
 *  modules (their drip offset = phaseIndex * drip_interval_days); nested Frequency modules and any
 *  loose phase leaves are folded into that module's lesson list, in reading order. */
export function toHookCourse(portable: PortableJourney): HookCourseOutline {
  const modules: HookModuleOutline[] = []

  const lessonsUnder = (children: PortableItem[], dripDays: number): HookLessonOutline[] => {
    const lessons: HookLessonOutline[] = []
    for (const child of children) {
      if (child.kind === 'lesson') {
        lessons.push({
          title: child.title,
          content_type: leafTypeToHookContentType(child.block_type),
          content_body: child.note,
          position: lessons.length,
          drip_days_after_enrollment: dripDays,
        })
      } else if (child.kind === 'module') {
        for (const leaf of child.children) {
          lessons.push({
            title: leaf.title,
            content_type: leafTypeToHookContentType(leaf.block_type),
            content_body: leaf.note,
            position: lessons.length,
            drip_days_after_enrollment: dripDays,
          })
        }
      }
    }
    return lessons
  }

  portable.items.forEach((node, phaseIndex) => {
    const dripDays = hookDripDaysForPhase(phaseIndex, portable.drip_interval_days)
    if (node.kind === 'phase') {
      modules.push({ title: node.title, position: modules.length, lessons: lessonsUnder(node.children, dripDays) })
    } else if (node.kind === 'module') {
      modules.push({ title: node.title, position: modules.length, lessons: lessonsUnder([node], dripDays) })
    } else {
      // A loose top-level leaf (flat journey): wrap it in an implicit single module.
      modules.push({ title: '', position: modules.length, lessons: lessonsUnder([node], dripDays) })
    }
  })

  return { title: portable.title, description: portable.summary ?? null, modules }
}
