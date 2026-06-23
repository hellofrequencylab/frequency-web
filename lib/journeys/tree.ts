// Journeys v2 — the read-model (ADR-252, docs/JOURNEYS.md §2/§5). Pure: turn the flat
// `journey_plan_items` rows into the Program → Phase → Module → Lesson tree the learner
// player renders, and derive completion from a member's completed-lesson set. No I/O, so it's
// fully unit-tested and shared by the player, the Run view, and reward firing.
//
// Completion is phase/journey-based (the season model is gone): a phase is complete when every
// REQUIRED leaf under it is done; the journey is complete when every phase is. A leaf is "done"
// when its id is in `completedIds` (lesson check-offs and practice check-offs are unified).

export type LeafType =
  | 'lesson' | 'video' | 'reading' | 'exercise' | 'reflection' | 'check' | 'resource' | 'practice'

const LEAF_TYPES = new Set<string>([
  'lesson', 'video', 'reading', 'exercise', 'reflection', 'check', 'resource', 'practice', 'section',
])

const LEAF_LABEL: Record<string, string> = {
  video: 'Video', reading: 'Reading', exercise: 'Exercise', reflection: 'Reflection',
  check: 'Knowledge check', resource: 'Resource', practice: 'Practice', lesson: 'Lesson',
}

/** A friendly fallback when a leaf has no title yet — its type, not a bare "Untitled"
 *  (build item §11.1 #7). Shared by the tree + the player's per-lesson content. */
export function leafTitle(title: string | null | undefined, type: string): string {
  const t = title?.trim()
  return t || LEAF_LABEL[type] || 'Lesson'
}

/** A raw block row (subset of journey_plan_items the tree needs). */
export interface BlockRow {
  id: string
  parent_id: string | null
  block_type: string
  sort_order: number | null
  title: string | null
  required: boolean | null
  est_minutes: number | null
  practice_id: string | null
}

export interface Lesson {
  id: string
  type: LeafType
  title: string
  required: boolean
  estMinutes: number | null
  practiceId: string | null
  done: boolean
}

export interface Module {
  id: string
  title: string
  lessons: Lesson[]
}

export interface Phase {
  id: string
  title: string
  modules: Module[]
  totalRequired: number
  doneRequired: number
  percent: number
  complete: boolean
}

export interface JourneyTree {
  phases: Phase[]
  totalRequired: number
  doneRequired: number
  percent: number
  complete: boolean
  /** First not-done lesson in reading order, or null when everything's done/empty. */
  currentLessonId: string | null
  /** Every lesson id in reading order (for prev/next nav). */
  lessonOrder: string[]
}

const bySort = (a: BlockRow, b: BlockRow) => (a.sort_order ?? 0) - (b.sort_order ?? 0)

/** Build the Program → Phase → Module → Lesson tree + completion from flat blocks. */
export function buildJourneyTree(blocks: readonly BlockRow[], completedIds: Iterable<string>): JourneyTree {
  const done = completedIds instanceof Set ? completedIds : new Set(completedIds)
  const childrenOf = new Map<string | null, BlockRow[]>()
  for (const b of blocks) {
    const key = b.parent_id ?? null
    const list = childrenOf.get(key) ?? []
    list.push(b)
    childrenOf.set(key, list)
  }
  for (const list of childrenOf.values()) list.sort(bySort)

  const toLesson = (b: BlockRow): Lesson => {
    const type = (LEAF_TYPES.has(b.block_type) ? (b.block_type === 'section' ? 'lesson' : b.block_type) : 'lesson') as LeafType
    return {
      id: b.id,
      type,
      title: leafTitle(b.title, type),
      required: b.required ?? true,
      estMinutes: b.est_minutes,
      practiceId: b.practice_id,
      done: done.has(b.id),
    }
  }

  // A phase's children are modules (containers) and/or loose leaves → wrap loose leaves in one
  // implicit module so the player has a uniform Phase → Module → Lesson shape.
  const buildModules = (phaseId: string): Module[] => {
    const kids = childrenOf.get(phaseId) ?? []
    const modules: Module[] = []
    let looseLessons: Lesson[] = []
    const flushLoose = () => {
      if (looseLessons.length) {
        modules.push({ id: `${phaseId}:loose:${modules.length}`, title: '', lessons: looseLessons })
        looseLessons = []
      }
    }
    for (const k of kids) {
      if (k.block_type === 'module') {
        flushLoose()
        const lessons = (childrenOf.get(k.id) ?? []).filter((c) => c.block_type !== 'module' && c.block_type !== 'phase').map(toLesson)
        modules.push({ id: k.id, title: k.title ?? '', lessons })
      } else if (k.block_type !== 'phase') {
        looseLessons.push(toLesson(k))
      }
    }
    flushLoose()
    return modules
  }

  // Roots: phases (or loose top-level leaves → one implicit phase, for legacy/flat journeys).
  const roots = childrenOf.get(null) ?? []
  const rawPhases: { id: string; title: string; modules: Module[] }[] = []
  const looseTop: Lesson[] = []
  for (const r of roots) {
    if (r.block_type === 'phase') {
      rawPhases.push({ id: r.id, title: r.title ?? 'Phase', modules: buildModules(r.id) })
    } else if (r.block_type !== 'module') {
      looseTop.push(toLesson(r))
    }
  }
  if (looseTop.length) {
    rawPhases.unshift({ id: 'implicit-phase', title: '', modules: [{ id: 'implicit-module', title: '', lessons: looseTop }] })
  }

  const phases: Phase[] = rawPhases.map((p) => {
    const lessons = p.modules.flatMap((m) => m.lessons)
    const required = lessons.filter((l) => l.required)
    const doneRequired = required.filter((l) => l.done).length
    const totalRequired = required.length
    return {
      id: p.id,
      title: p.title,
      modules: p.modules,
      totalRequired,
      doneRequired,
      percent: totalRequired ? Math.round((doneRequired / totalRequired) * 100) : 100,
      complete: totalRequired === 0 ? false : doneRequired === totalRequired,
    }
  })

  const totalRequired = phases.reduce((n, p) => n + p.totalRequired, 0)
  const doneRequired = phases.reduce((n, p) => n + p.doneRequired, 0)
  const lessonOrder = phases.flatMap((p) => p.modules.flatMap((m) => m.lessons.map((l) => l.id)))
  const allLessons = phases.flatMap((p) => p.modules.flatMap((m) => m.lessons))
  const currentLessonId = allLessons.find((l) => !l.done)?.id ?? null

  return {
    phases,
    totalRequired,
    doneRequired,
    percent: totalRequired ? Math.round((doneRequired / totalRequired) * 100) : 0,
    complete: totalRequired > 0 && doneRequired === totalRequired,
    currentLessonId,
    lessonOrder,
  }
}
