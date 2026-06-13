// The course model — adapts a Journey into the e-learning "course player" shape
// (docs/JOURNEYS.md §5A, ADR-244). Pure + unit-tested: no IO, no React.
//
// A Journey renders as a COURSE: Sections → Lessons, with overall progress and a
// per-lesson status (done / current / todo). `buildCourse` maps the plan's blocks
// (practice steps + lesson/section blocks, ADR-244) onto this shape: practice + lesson
// blocks become lessons, section blocks open syllabus modules that group the lessons
// after them, and a lesson body's video link is parsed into an inline player. The
// player keeps reading this same shape — the UI never has to change.

import type { JourneyProgress, JourneyProgressItem, JourneyPlanItem } from '@/lib/journey-plans'
import { parseVideoEmbed, type VideoEmbed } from '@/lib/video-embed'

export type LessonStatus = 'done' | 'current' | 'todo'

export interface CourseLesson {
  /** Stable id (the journey_plan_items.id). */
  id: string
  /** A practice block "completes" by LOGGING; a lesson/check block by CHECK-OFF. */
  kind: 'practice' | 'lesson'
  title: string
  /** Markdown lesson body / practice instructions (tier content, then practice copy). */
  body: string | null
  /** A YouTube/Vimeo/file link found in the body, parsed into an inline player. Null if none. */
  video: VideoEmbed | null
  estMinutes: number | null
  /** The practice this lesson logs, for a practice block. Null for lesson/check blocks. */
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

function blockType(b: JourneyPlanItem): NonNullable<JourneyPlanItem['block_type']> {
  return b.block_type ?? 'practice'
}

/** A practice block → lesson. Tier content (the depth the viewer sees) wins for the
 *  title/body; the practice's own copy is the fallback. Progress fills the meter. */
function practiceLesson(
  b: JourneyPlanItem,
  prog: JourneyProgressItem | null,
  status: LessonStatus,
): CourseLesson {
  const body = prog?.tierContent?.body ?? b.practice?.description ?? b.body ?? null
  return {
    id: b.id,
    kind: 'practice',
    title: prog?.tierContent?.title ?? b.practice?.title ?? b.title ?? 'Practice',
    body,
    video: parseVideoEmbed(body),
    estMinutes: prog?.tierContent?.est_minutes ?? b.est_minutes ?? null,
    practiceId: b.practice_id,
    status,
    cadenceLabel: b.cadence ?? b.practice?.cadence ?? null,
    loggedThisWeek: prog?.loggedThisWeek ?? 0,
    target: prog?.target ?? 0,
  }
}

/** A lesson / resource / check block → lesson. Completes via check-off, not a log. */
function contentLesson(b: JourneyPlanItem, status: LessonStatus): CourseLesson {
  return {
    id: b.id,
    kind: 'lesson',
    title: b.title ?? 'Lesson',
    body: b.body ?? null,
    video: parseVideoEmbed(b.body),
    estMinutes: b.est_minutes ?? null,
    practiceId: null,
    status,
    cadenceLabel: null,
    loggedThisWeek: 0,
    target: 0,
  }
}

/** Build the course view from a Journey's blocks + the viewer's live state.
 *
 *  Status (unified across block kinds): a PRACTICE block is `done` once it meets its
 *  weekly cadence (from `progress`); a LESSON/CHECK block is `done` once it has a
 *  check-off row (`completedLessonIds`). The first not-done lesson, in author order, is
 *  `current`; the rest `todo`.
 *
 *  Grouping: SECTION blocks become syllabus modules — each section header opens a new
 *  group that collects the lessons after it. Lessons before the first section fall into
 *  a leading untitled "path" group. Sections with no lessons are dropped. Counts +
 *  progress are computed across the flattened lesson order. */
export function buildCourse(input: {
  blocks: JourneyPlanItem[]
  progress: Pick<JourneyProgress, 'items'>
  completedLessonIds?: ReadonlySet<string>
}): Course {
  const completed = input.completedLessonIds ?? new Set<string>()
  const progressById = new Map(input.progress.items.map((p) => [p.id, p]))

  const ordered = [...input.blocks].sort((a, b) => a.sort_order - b.sort_order)

  const isDone = (b: JourneyPlanItem): boolean =>
    blockType(b) === 'practice' ? progressById.get(b.id)?.met ?? false : completed.has(b.id)

  // The first not-done renderable (non-section) block, in order, is the "current" lesson.
  const firstOpenId = ordered.find((b) => blockType(b) !== 'section' && !isDone(b))?.id ?? null

  const toLesson = (b: JourneyPlanItem): CourseLesson => {
    const status: LessonStatus = isDone(b) ? 'done' : b.id === firstOpenId ? 'current' : 'todo'
    return blockType(b) === 'practice'
      ? practiceLesson(b, progressById.get(b.id) ?? null, status)
      : contentLesson(b, status)
  }

  // Walk in order, opening a new group at each section header. The leading group (lessons
  // before any section) is the untitled "path". Empty groups never make it into `sections`.
  const sections: CourseSection[] = []
  let group: CourseSection | null = null
  const flush = () => {
    if (group && group.lessons.length > 0) sections.push(group)
  }
  for (const b of ordered) {
    if (blockType(b) === 'section') {
      flush()
      group = { id: b.id, title: b.title ?? null, lessons: [] }
    } else {
      if (!group) group = { id: SINGLE_SECTION_ID, title: null, lessons: [] }
      group.lessons.push(toLesson(b))
    }
  }
  flush()

  const lessons = sections.flatMap((s) => s.lessons)
  const doneCount = lessons.filter((l) => l.status === 'done').length
  const totalCount = lessons.length
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100)

  const currentLessonId =
    lessons.find((l) => l.status === 'current')?.id ??
    lessons.find((l) => l.status === 'todo')?.id ??
    lessons[0]?.id ??
    null

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
    kind: 'lesson',
    title: l.title || 'Untitled lesson',
    body: l.body,
    video: parseVideoEmbed(l.body),
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
