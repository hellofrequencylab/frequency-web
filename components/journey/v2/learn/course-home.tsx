import Link from 'next/link'
import {
  Anchor,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Hammer,
  Lock,
  NotebookPen,
  Paperclip,
  Play,
  Repeat,
  Sparkles,
  Trophy,
  Video,
  type LucideIcon,
} from 'lucide-react'
import type { JourneyTree, LeafType, Phase } from '@/lib/journeys/tree'
import { unlockLine, type PhaseLockState } from '@/lib/journeys/schedule'
import { ProgressTrack } from '@/components/ui/progress-track'
import { SectionHeader } from '@/components/ui/section-header'
import { buttonClasses } from '@/components/ui/button'
import { ProgressRing } from '@/components/journey/nav/progress-ring'

// THE COURSE HOME (/journeys/<slug>/learn) — where an enrolled member lands. It answers three
// questions in order, and nothing else: how far am I (the gauges), what do I do now (Up next), and
// what is the whole shape (the path). The sales copy stays on the sales page; the lesson itself
// stays in the focus player. Server Components, no client JS: the weeks fold with <details>.
//
// The path is a vertical timeline, one node per week: a check when done, the number when open, a
// lock with the opening date when dripped. Locked weeks still show their lesson titles, dimmed, as
// the teaser (the content itself never leaves the server until the week opens: the player gates
// it). The current week is open; done and locked weeks fold.

const LEAF_ICON: Record<LeafType, LucideIcon> = {
  lesson: BookOpen,
  video: Video,
  reading: FileText,
  exercise: Hammer,
  reflection: NotebookPen,
  check: ClipboardCheck,
  resource: Paperclip,
  practice: Sparkles,
}

/** The player deep link for one lesson. */
export const playHref = (slug: string, lessonId?: string | null) =>
  lessonId ? `/journeys/${slug}/play?lesson=${encodeURIComponent(lessonId)}` : `/journeys/${slug}/play`

/** The unit the cadence counts in (schedule.cadenceUnit): a monthly Journey reads "Month 3". */
type Unit = 'week' | 'month'
const unitWord = (u: Unit) => (u === 'month' ? 'Month' : 'Week')

const weekLabel = (p: Phase, i: number, u: Unit) => (p.title ? `${unitWord(u)} ${i + 1}` : `Phase ${i + 1}`)

/** The phase's own title, or null when it only repeats the label ("Week 4" titled "Week 4"). */
const ownTitle = (p: Phase, i: number, u: Unit) => {
  const t = p.title?.trim()
  return t && t.toLowerCase() !== weekLabel(p, i, u).toLowerCase() ? t : null
}

/** An ongoing Journey's place in its year (schedule.ongoingCycle), or null for one that ends. */
export type OngoingCycle = { year: number; phaseIndex: number; nextAt: Date | null } | null

/** The first not-done lesson in one phase, when that phase is open. */
function firstOpenIn(tree: JourneyTree, locks: PhaseLockState[], pi: number) {
  if (locks[pi]?.locked || !tree.phases[pi]) return null
  for (const m of tree.phases[pi].modules) for (const l of m.lessons) if (!l.done) return { lesson: l, phaseIndex: pi }
  return null
}

/** Up next. An ongoing Journey points at THIS month first (the calendar, not the backlog), then
 *  falls back to catching up; one that ends walks the path in order. */
export function upNext(tree: JourneyTree, locks: PhaseLockState[], cycle: OngoingCycle) {
  return (cycle ? firstOpenIn(tree, locks, cycle.phaseIndex) : null) ?? resumePoint(tree, locks)
}

/** Where the member is: the first not-done lesson in an OPEN week, never a locked one. */
function resumePoint(tree: JourneyTree, locks: PhaseLockState[]) {
  for (let pi = 0; pi < tree.phases.length; pi++) {
    if (locks[pi]?.locked) continue
    for (const m of tree.phases[pi].modules)
      for (const l of m.lessons) if (!l.done) return { lesson: l, phaseIndex: pi }
  }
  return null
}

/** The gauges + Up next. One ring for the whole Journey, bars for this week, a countdown to the
 *  next week, and the single primary action on the page. */
export function CourseProgress({
  slug,
  tree,
  locks,
  anchorLessonId,
  unit = 'week',
  cycle = null,
}: {
  slug: string
  tree: JourneyTree
  locks: PhaseLockState[]
  anchorLessonId: string | null
  unit?: Unit
  cycle?: OngoingCycle
}) {
  const next = upNext(tree, locks, cycle)
  const openCount = locks.filter((l) => !l.locked).length
  const currentIndex = cycle?.phaseIndex ?? next?.phaseIndex ?? Math.max(0, openCount - 1)
  const current = tree.phases[currentIndex]
  const nextLock = locks.find((l) => l.locked) ?? null
  const waiting = !next && !tree.complete && !!nextLock
  // The next turn of the calendar: the next locked phase, or for an ongoing Journey whose phases
  // are all open, the day the next month (or week) of the cycle begins.
  const nextAt = nextLock?.unlockAt ?? (cycle ? cycle.nextAt : null)

  return (
    <section aria-label="Your progress" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Gauges */}
      <div className="flex items-center gap-5 rounded-card border border-border bg-surface p-5 lift-1">
        <ProgressRing value={tree.percent} size={104} stroke={9} label={`${tree.percent}% of this Journey done`}>
          <span className="flex flex-col items-center leading-none">
            <span className="text-lead font-bold tabular-nums text-text">{tree.percent}%</span>
            <span className="mt-1 text-meta text-muted">done</span>
          </span>
        </ProgressRing>
        <dl className="min-w-0 flex-1 space-y-3">
          <div>
            <dt className="text-meta text-muted">Lessons</dt>
            <dd className="text-body-sm font-semibold tabular-nums text-text">
              {tree.doneRequired} of {tree.totalRequired}
            </dd>
          </div>
          {current && (
            <div>
              <dt className="flex items-center justify-between text-meta text-muted">
                <span>
                  {weekLabel(current, currentIndex, unit)} of {tree.phases.length}
                  {cycle ? ` · Year ${cycle.year}` : ''}
                </span>
                <span className="tabular-nums">
                  {current.doneRequired}/{current.totalRequired}
                </span>
              </dt>
              <dd className="mt-1">
                <ProgressTrack value={current.percent} minVisible={2} label={`${current.percent}% of this ${unit} done`} size="sm" />
              </dd>
            </div>
          )}
          <div>
            <dt className="text-meta text-muted">Next {unit}</dt>
            <dd className="text-body-sm font-semibold text-text">
              {nextAt ? unlockLine(nextAt) : `Every ${unit} is open`}
            </dd>
          </div>
        </dl>
      </div>

      {/* Up next: the one primary action. */}
      <div className="flex flex-col justify-between gap-4 rounded-card border border-primary/30 bg-primary-bg/40 p-5">
        {tree.complete && cycle ? (
          <div className="flex items-start gap-3">
            <Repeat className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-lead font-bold text-text">Every {unit} is done.</p>
              <p className="mt-1 text-body-sm text-muted">
                This Journey repeats each year. You are in {weekLabel(current, currentIndex, unit)} of Year {cycle.year}; come back to it any time.
              </p>
            </div>
          </div>
        ) : tree.complete ? (
          <div className="flex items-start gap-3">
            <Trophy className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-lead font-bold text-text">You finished this Journey.</p>
              <p className="mt-1 text-body-sm text-muted">Every lesson is done. Revisit any of them below, any time.</p>
            </div>
          </div>
        ) : waiting ? (
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
            <div>
              <p className="text-lead font-bold text-text">You are caught up.</p>
              <p className="mt-1 text-body-sm text-muted">{unlockLine(nextLock.unlockAt)}. Keep your daily practice going until then.</p>
            </div>
          </div>
        ) : next ? (
          <div>
            <p className="eyebrow text-primary-strong">Up next</p>
            <p className="mt-1 text-lead font-bold text-text">{next.lesson.title}</p>
            <p className="mt-1 text-body-sm text-muted">
              {weekLabel(tree.phases[next.phaseIndex], next.phaseIndex, unit)}
              {ownTitle(tree.phases[next.phaseIndex], next.phaseIndex, unit) ? ` · ${ownTitle(tree.phases[next.phaseIndex], next.phaseIndex, unit)}` : ''}
              {next.lesson.estMinutes ? ` · ${next.lesson.estMinutes} min` : ''}
              {next.lesson.id === anchorLessonId ? ' · Daily anchor' : ''}
            </p>
          </div>
        ) : null}
        <Link href={playHref(slug, next?.lesson.id)} className={`${buttonClasses('primary', 'md')} self-start`}>
          <Play className="h-4 w-4" aria-hidden /> {tree.doneRequired === 0 ? 'Start' : tree.complete || waiting ? 'Open the player' : 'Continue'}
        </Link>
      </div>
    </section>
  )
}

/** The path: every week as a node on one timeline, with lesson previews. */
export function CoursePath({
  slug,
  tree,
  locks,
  phaseFocusById,
  pillarByLesson,
  anchorLessonId,
  unit = 'week',
  cycle = null,
}: {
  slug: string
  tree: JourneyTree
  locks: PhaseLockState[]
  phaseFocusById: Record<string, string>
  pillarByLesson: Record<string, string>
  anchorLessonId: string | null
  unit?: Unit
  cycle?: OngoingCycle
}) {
  const next = upNext(tree, locks, cycle)
  return (
    <section id="the-path" aria-label="The path">
      <SectionHeader title="Your path" count={tree.phases.length} />
      <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[1.1875rem] before:top-6 before:w-px before:bg-border">
        {tree.phases.map((p, i) => {
          const lock = locks[i] ?? { locked: false, unlockAt: null }
          const isCurrent = cycle ? cycle.phaseIndex === i : next?.phaseIndex === i
          const lessons = p.modules.flatMap((m) => m.lessons)
          const minutes = lessons.reduce((n, l) => n + (l.estMinutes ?? 0), 0)
          const state = lock.locked ? 'locked' : p.complete ? 'done' : isCurrent ? 'current' : 'open'
          return (
            <li key={p.id} className="relative pl-12">
              {/* The node on the line. */}
              <span
                aria-hidden
                className={`absolute left-0 top-3 flex h-10 w-10 items-center justify-center rounded-pill border-2 text-body-sm font-bold tabular-nums ${
                  state === 'done'
                    ? 'border-success bg-success text-on-success'
                    : state === 'current'
                      ? 'border-primary bg-primary text-on-primary'
                      : state === 'locked'
                        ? 'border-border bg-surface-elevated text-subtle'
                        : 'border-border-strong bg-surface text-text'
                }`}
              >
                {state === 'done' ? <Check className="h-4 w-4" /> : state === 'locked' ? <Lock className="h-4 w-4" /> : i + 1}
              </span>

              <details
                open={isCurrent || undefined}
                className={`group rounded-card border bg-surface ${isCurrent ? 'border-primary/40 lift-1' : 'border-border'}`}
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-body font-semibold ${state === 'locked' ? 'text-muted' : 'text-text'}`}>
                      {ownTitle(p, i, unit) ?? weekLabel(p, i, unit)}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-muted">
                      {ownTitle(p, i, unit) && <span className="font-semibold">{weekLabel(p, i, unit)}</span>}
                      <span>
                        {lessons.length} lesson{lessons.length === 1 ? '' : 's'}
                        {minutes > 0 ? ` · ${minutes} min` : ''}
                      </span>
                      {state === 'current' && (
                        <span className="rounded-pill bg-primary-bg px-2 py-0.5 text-3xs font-semibold text-primary-strong">This {unit}</span>
                      )}
                      {state === 'locked' && <span className="font-medium">{unlockLine(lock.unlockAt)}</span>}
                    </span>
                    {!lock.locked && (
                      <span className="mt-2 flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <ProgressTrack value={p.percent} minVisible={2} label={`${p.percent}% of ${weekLabel(p, i, unit)} done`} size="sm" tone={p.complete ? 'success' : 'primary'} />
                        </span>
                        <span className="shrink-0 text-3xs tabular-nums text-muted">
                          {p.doneRequired}/{p.totalRequired}
                        </span>
                      </span>
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden />
                </summary>

                <div className="border-t border-border px-2 pb-2 pt-2">
                  {!lock.locked && phaseFocusById[p.id] && (
                    <p className="line-clamp-3 px-2 pb-2 text-body-sm leading-relaxed text-muted">{phaseFocusById[p.id]}</p>
                  )}
                  <ul className="space-y-0.5">
                    {lessons.map((l) => {
                      const Icon = LEAF_ICON[l.type] ?? BookOpen
                      const isNext = next?.lesson.id === l.id
                      const row = (
                        <>
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border ${
                              l.done ? 'border-success bg-success text-on-success' : isNext ? 'border-primary text-primary-strong' : 'border-border text-subtle'
                            }`}
                          >
                            {l.done ? <Check className="h-3 w-3" /> : lock.locked ? <Lock className="h-2.5 w-2.5" /> : null}
                          </span>
                          <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{l.title}</span>
                          {l.id === anchorLessonId && <Anchor className="h-3.5 w-3.5 shrink-0 text-primary-strong" aria-label="Daily anchor" />}
                          {pillarByLesson[l.id] && (
                            <span className="hidden shrink-0 rounded-pill bg-surface-elevated px-2 py-0.5 text-3xs font-medium text-muted sm:inline">
                              {pillarByLesson[l.id]}
                            </span>
                          )}
                          {l.estMinutes ? <span className="shrink-0 text-3xs tabular-nums text-muted">{l.estMinutes} min</span> : null}
                          {isNext && <ArrowRight className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />}
                        </>
                      )
                      return (
                        <li key={l.id}>
                          {lock.locked ? (
                            <div aria-disabled="true" className="flex items-center gap-2.5 rounded-control px-2 py-2 text-body-sm text-subtle">
                              {row}
                            </div>
                          ) : (
                            <Link
                              href={playHref(slug, l.id)}
                              aria-current={isNext ? 'step' : undefined}
                              className={`flex items-center gap-2.5 rounded-control px-2 py-2 text-body-sm transition-colors ${
                                isNext ? 'bg-primary-bg font-medium text-primary-strong' : 'text-text hover:bg-surface-elevated'
                              }`}
                            >
                              {row}
                            </Link>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </details>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
