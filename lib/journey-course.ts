// The course model — adapts a Journey into the e-learning "course player" shape
// (docs/JOURNEYS.md §5A, ADR-244). Pure + unit-tested: no IO, no React.
//
// A Journey renders as a COURSE: Sections → Lessons, with overall progress and a
// per-lesson status (done / current / todo). Today the only block type in the
// schema is the practice step, so `buildCourse` maps each practice step to a lesson
// inside one implicit Section. When the lesson/section block model lands (migration
// 20260617000000), `buildCourse` gains a richer source but the player keeps reading
// this same shape — the UI never has to change.

import type { JourneyProgress, JourneyProgressItem } from '@/lib/journey-plans'

export type LessonStatus = 'done' | 'current' | 'todo'

export interface CourseLesson {
  /** Stable id (the journey_plan_items.id today). */
  id: string
  title: string
  /** Markdown lesson body / practice instructions (tier content, then practice copy). */
  body: string | null
  estMinutes: number | null
  /** The practice this lesson logs, when it's a practice block (today: always set).
   *  Null for future pure-lesson blocks, which complete via check-off, not a log. */
  practiceId: string | null
  status: LessonStatus
  /** Human cadence label for practice lessons ("Daily", "Weekly"…). */
  cadenceLabel: string | null
  /** Distinct days logged this week (practice lessons) — drives the row's mini meter. */
  loggedThisWeek: number
  /** Weekly target (practice lessons). */
  target: number
}

export interface CourseSection {
  id: string
  title: string | null
  lessons: CourseLesson[]
}

export interface Course {
  sections: CourseSection[]
  totalCount: number
  doneCount: number
  /** 0–100, rounded. */
  percent: number
  /** The lesson to open by default: the first 'current', else the first 'todo',
   *  else the first lesson (all done). Null only when the course is empty. */
  currentLessonId: string | null
}

const SINGLE_SECTION_ID = 'section:path'

/** Map a practice step's resolved content to a lesson body + title. Tier content
 *  (the depth the viewer sees) wins; the practice's own copy is the fallback. */
function lessonFromStep(step: JourneyProgressItem, status: LessonStatus): CourseLesson {
  const title = step.tierContent?.title ?? step.practice?.title ?? 'Practice'
  const body = step.tierContent?.body ?? step.practice?.description ?? null
  const cadenceLabel = step.cadence ?? step.practice?.cadence ?? null
  return {
    id: step.id,
    title,
    body,
    estMinutes: step.tierContent?.est_minutes ?? null,
    practiceId: step.practice_id,
    status,
    cadenceLabel,
    loggedThisWeek: step.loggedThisWeek,
    target: step.target,
  }
}

/** Build the course view from a member's live Journey progress.
 *
 *  Status rule (practice lessons): a step that has met its weekly cadence is `done`;
 *  the first not-yet-met step, in order, is `current`; the rest are `todo`. This
 *  mirrors `getActiveJourneyProgress`'s "current step" so the syllabus and the
 *  Next-Step card always agree. */
export function buildCourse(progress: Pick<JourneyProgress, 'items' | 'nextItem'>): Course {
  const currentId = progress.nextItem?.id ?? null
  let currentAssigned = false

  const lessons: CourseLesson[] = progress.items.map((step) => {
    let status: LessonStatus
    if (step.met) {
      status = 'done'
    } else if ((currentId && step.id === currentId) || (!currentId && !currentAssigned)) {
      status = 'current'
      currentAssigned = true
    } else {
      status = 'todo'
    }
    return lessonFromStep(step, status)
  })

  const doneCount = lessons.filter((l) => l.status === 'done').length
  const totalCount = lessons.length
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100)

  // Default selection: the current lesson, else the first todo, else the first lesson.
  const currentLessonId =
    lessons.find((l) => l.status === 'current')?.id ??
    lessons.find((l) => l.status === 'todo')?.id ??
    lessons[0]?.id ??
    null

  const sections: CourseSection[] =
    totalCount === 0 ? [] : [{ id: SINGLE_SECTION_ID, title: null, lessons }]

  return { sections, totalCount, doneCount, percent, currentLessonId }
}

/** Flatten the course back into lesson order — the player walks this for prev/next. */
export function courseLessonOrder(course: Course): CourseLesson[] {
  return course.sections.flatMap((s) => s.lessons)
}

/** Minimal draft lesson, for the EDITOR's live preview (no progress, no logging). */
export interface CourseDraftLesson {
  id: string
  title: string
  body: string | null
  cadenceLabel: string | null
  estMinutes?: number | null
}

/** Build a Course from an author's draft for the editor's live preview. Every lesson
 *  carries `practiceId: null`, so the player renders a non-interactive CTA (no log
 *  fires) — a true preview. The first lesson reads as `current`, the rest `todo`. */
export function previewCourse(lessons: CourseDraftLesson[]): Course {
  const courseLessons: CourseLesson[] = lessons.map((l, i) => ({
    id: l.id,
    title: l.title || 'Untitled lesson',
    body: l.body,
    estMinutes: l.estMinutes ?? null,
    practiceId: null,
    status: i === 0 ? 'current' : 'todo',
    cadenceLabel: l.cadenceLabel,
    loggedThisWeek: 0,
    target: 0,
  }))
  return {
    sections: courseLessons.length === 0 ? [] : [{ id: SINGLE_SECTION_ID, title: null, lessons: courseLessons }],
    totalCount: courseLessons.length,
    doneCount: 0,
    percent: 0,
    currentLessonId: courseLessons[0]?.id ?? null,
  }
}
