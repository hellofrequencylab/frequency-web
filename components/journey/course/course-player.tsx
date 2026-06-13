'use client'

import { useMemo, useState } from 'react'
import { Check, Circle, Clock, ChevronLeft, ChevronRight, PlayCircle } from 'lucide-react'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JourneyLogButton } from '@/components/journey/journey-log-button'
import { courseLessonOrder, type Course, type CourseLesson } from '@/lib/journey-course'

// The course player (docs/JOURNEYS.md §5A, ADR-244) — the e-learning face of an
// ADOPTED Journey. A two-pane "classic course player": a left SYLLABUS rail (overall
// progress + Sections → Lessons with per-lesson status) beside the active LESSON pane
// (content + a "Complete & continue" action that advances). The journey page registers
// this route as `scoped` (lib/layout/page-chrome.ts), so the syllabus is the page's
// in-body rail and the player gets full width.
//
// Practice lessons "complete" by LOGGING the practice (the same practice_logs the
// gamification + season clock run on), so one tap advances the course AND earns the
// rewards. `railExtras` (streak / companions / gamification — server components behind
// Suspense) and `tierControl` are passed in as nodes so this client shell can host them
// without importing server code.

export function CoursePlayer({
  course,
  planTitle,
  accent,
  railExtras,
  tierControl,
}: {
  course: Course
  planTitle: string
  accent: string | null
  railExtras?: React.ReactNode
  tierControl?: React.ReactNode
}) {
  const order = useMemo(() => courseLessonOrder(course), [course])
  const [selectedId, setSelectedId] = useState<string | null>(course.currentLessonId)

  const index = Math.max(0, order.findIndex((l) => l.id === selectedId))
  const lesson = order[index] ?? null
  const prev = index > 0 ? order[index - 1] : null
  const next = index < order.length - 1 ? order[index + 1] : null

  const tint = accentTint(accent, 16)
  const fill = accentColor(accent)

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* ── Syllabus rail ── */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <ProgressHeader course={course} fill={fill} tint={tint} />

        {/* On mobile the syllabus collapses; from lg it's the standing rail. */}
        <details className="group mt-3 lg:open" open>
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl bg-surface-elevated px-3 py-2 text-xs font-bold uppercase tracking-wide text-subtle lg:hidden">
            Course content
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
          </summary>

          <nav className="mt-2 space-y-4" aria-label="Course content">
            {course.sections.map((section) => (
              <div key={section.id}>
                {section.title && (
                  <h3 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-subtle">
                    {section.title}
                  </h3>
                )}
                <ul className="space-y-0.5">
                  {section.lessons.map((l, i) => (
                    <LessonRow
                      key={l.id}
                      lesson={l}
                      n={i + 1}
                      active={l.id === lesson?.id}
                      fill={fill}
                      onSelect={() => setSelectedId(l.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </details>

        {(railExtras || tierControl) && (
          <div className="mt-5 space-y-4">
            {railExtras}
            {tierControl}
          </div>
        )}
      </aside>

      {/* ── Lesson pane ── */}
      <section className="min-w-0">
        {lesson ? (
          <LessonPane
            lesson={lesson}
            n={index + 1}
            total={order.length}
            planTitle={planTitle}
            fill={fill}
            tint={tint}
            prev={prev}
            next={next}
            onGo={(id) => setSelectedId(id)}
          />
        ) : (
          <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
            This Journey has no lessons yet.
          </p>
        )}
      </section>
    </div>
  )
}

// ── Progress header (top of the syllabus) ──
function ProgressHeader({ course, fill, tint }: { course: Course; fill: string; tint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold text-text">Your progress</span>
        <span className="text-sm font-bold" style={{ color: fill }}>
          {course.percent}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ backgroundColor: tint }}>
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${course.percent}%`, backgroundColor: fill }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        {course.doneCount} of {course.totalCount} {course.totalCount === 1 ? 'lesson' : 'lessons'} complete
      </p>
    </div>
  )
}

// ── A syllabus lesson row ──
function LessonRow({
  lesson,
  n,
  active,
  fill,
  onSelect,
}: {
  lesson: CourseLesson
  n: number
  active: boolean
  fill: string
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${
          active ? 'bg-primary-bg' : 'hover:bg-surface-elevated'
        }`}
      >
        <StatusIcon status={lesson.status} fill={fill} />
        <span className={`min-w-0 flex-1 truncate ${active ? 'font-semibold text-text' : 'text-muted'}`}>
          <span className="text-subtle">{n}. </span>
          {lesson.title}
        </span>
        {lesson.cadenceLabel && (
          <span className="shrink-0 text-2xs text-subtle">{lesson.cadenceLabel}</span>
        )}
      </button>
    </li>
  )
}

function StatusIcon({ status, fill }: { status: CourseLesson['status']; fill: string }) {
  if (status === 'done') {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: fill }}
        aria-label="Complete"
      >
        <Check className="h-2.5 w-2.5 text-on-primary" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  if (status === 'current') {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
        style={{ borderColor: fill }}
        aria-label="In progress"
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: fill }} />
      </span>
    )
  }
  return <Circle className="h-4 w-4 shrink-0 text-subtle" aria-label="Not started" />
}

// ── The active lesson ──
function LessonPane({
  lesson,
  n,
  total,
  planTitle,
  fill,
  tint,
  prev,
  next,
  onGo,
}: {
  lesson: CourseLesson
  n: number
  total: number
  planTitle: string
  fill: string
  tint: string
  prev: CourseLesson | null
  next: CourseLesson | null
  onGo: (id: string) => void
}) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
        Lesson {n} of {total}
      </p>
      <h1 className="mt-1 text-xl font-bold text-text sm:text-2xl">{lesson.title}</h1>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {lesson.cadenceLabel && (
          <span className="inline-flex items-center gap-1">
            <PlayCircle className="h-3.5 w-3.5" aria-hidden /> {lesson.cadenceLabel}
          </span>
        )}
        {lesson.estMinutes != null && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {lesson.estMinutes} min
          </span>
        )}
        {lesson.target > 0 && (
          <span className="text-subtle">
            {lesson.loggedThisWeek}/{lesson.target} this week
          </span>
        )}
      </div>

      {lesson.body && (
        <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text">{lesson.body}</div>
      )}

      {/* Complete & continue — for a practice lesson this LOGS the practice (firing the
          rewards) and advances to the next lesson. */}
      <div className="mt-6 border-t border-border pt-5">
        {lesson.practiceId ? (
          <div className="space-y-3">
            <JourneyLogButton
              practiceId={lesson.practiceId}
              planTitle={planTitle}
              full
              label={lesson.status === 'done' ? 'Logged — log again' : 'Complete & continue'}
              onLogged={() => next && onGo(next.id)}
            />
            {lesson.status === 'done' && next && (
              <button
                type="button"
                onClick={() => onGo(next.id)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl px-5 py-3 text-sm font-semibold transition-colors"
                style={{ backgroundColor: tint, color: fill }}
              >
                Continue to next lesson <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        ) : (
          next && (
            <button
              type="button"
              onClick={() => onGo(next.id)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-base font-bold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden /> Complete &amp; continue
            </button>
          )
        )}
      </div>

      {/* Prev / Next walker */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <NavButton dir="prev" lesson={prev} onGo={onGo} />
        <NavButton dir="next" lesson={next} onGo={onGo} />
      </div>
    </article>
  )
}

function NavButton({
  dir,
  lesson,
  onGo,
}: {
  dir: 'prev' | 'next'
  lesson: CourseLesson | null
  onGo: (id: string) => void
}) {
  if (!lesson) return <span className="flex-1" />
  const isPrev = dir === 'prev'
  return (
    <button
      type="button"
      onClick={() => onGo(lesson.id)}
      className={`group flex min-w-0 max-w-[48%] flex-col rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-surface-elevated ${
        isPrev ? '' : 'ml-auto items-end text-right'
      }`}
    >
      <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
        {isPrev && <ChevronLeft className="h-3 w-3" aria-hidden />}
        {isPrev ? 'Previous' : 'Next'}
        {!isPrev && <ChevronRight className="h-3 w-3" aria-hidden />}
      </span>
      <span className="w-full truncate text-xs font-medium text-muted group-hover:text-text">
        {lesson.title}
      </span>
    </button>
  )
}
