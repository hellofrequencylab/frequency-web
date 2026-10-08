'use client'

// Journeys v2 — the LEARN player (the "follow-along course" overhaul of the lesson player). A
// richer sibling of components/journey/v2/journey-player.tsx (retired): it keeps the working surface intact
// (progressive-disclosure Phase → Module → Lesson syllabus, drip lock, the "Mark complete &
// continue" completion flow via completeJourneyLessonAction, the trophy celebration) and layers
// in the cohesion a follower needs — each week's focus copy, a Pillar badge on practice steps, and
// the real practice/lesson content in the lesson pane (the rich detail is PRE-RENDERED on the
// server and handed in as a node map, the RSC interleaving pattern, so this client bundle stays
// lean). Minimal client state: selected lesson + open phases; progress + lock come from the server.

import { useState, useTransition, useMemo, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, ChevronDown, List, Lock, Sparkles, Award, Compass, AlertTriangle, Anchor, CalendarClock, Layers, X } from 'lucide-react'
import { useMindless } from '@/components/on-air/mindless'
import { parseVideoEmbed } from '@/lib/video-embed'
import { isError } from '@/lib/action-result'
import { cadenceUnit, phaseLockStates, unlockLine } from '@/lib/journeys/schedule'
import { completeJourneyLessonAction, uncompleteJourneyLessonAction } from '@/app/(main)/journeys/[slug]/learn/actions'
import { TrophyCelebration, type TrophyMilestone } from '@/components/journey/v2/trophy-celebration'
import { PracticeActions } from '@/components/journey/v2/learn/practice-actions'
import type { JourneyTree } from '@/lib/journeys/tree'
import type { LessonContent, CheckConfig } from '@/lib/journeys/store'
import type { PartialToday } from '@/lib/practices'
import { ProgressTrack } from '@/components/ui/progress-track'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Dialog } from '@/components/ui/dialog'

interface Props {
  slug: string
  /** The journey's name — used only for the completion celebration (the page header carries the
   *  visible title, so the progress card doesn't repeat it). */
  title: string
  tree: JourneyTree
  lessonsById: Record<string, LessonContent>
  /** Pre-rendered rich detail for a step (practice write-up etc.), keyed by lesson/item id. The
   *  player renders this node in the lesson pane when present (server-rendered, no client cost). */
  detailById?: Record<string, ReactNode>
  /** Each phase's focus copy (the week's "what we're working on"), keyed by phase id. */
  phaseFocusById?: Record<string, string>
  /** Pillar name for a practice step, keyed by lesson id — drives the badge in the syllabus + header. */
  pillarByLesson?: Record<string, string>
  /** The linked library practice id for a practice step, keyed by lesson id — drives the per-step
   *  Practice (Mindless overlay) + Log actions. Absent on non-practice steps. */
  practiceIdByLesson?: Record<string, string>
  /** Whether each practice step runs On Air's timer (Practice button) vs a one-tap Log it, keyed by
   *  lesson id. Defaults to timer when unknown. */
  usesTimerByLesson?: Record<string, boolean>
  /** The lesson id of the Journey's Anchor practice (ADR-307): the daily through-line, badged
   *  "Daily anchor" in the syllabus + lesson pane. Null when none is set. */
  anchorLessonId?: string | null
  /** Per-phase scheduled touchpoint Events (ADR-307), keyed by phase id — the dated Circle Meetup
   *  and Weekend Gathering for that week, shown in the syllabus under the week's focus. */
  phaseEventsById?: Record<
    string,
    { meetup: { slug: string; title: string; startsAt: string } | null; gathering: { slug: string; title: string; startsAt: string } | null }
  >
  /** Practice ids the member has logged TODAY — gates a practice step's "Mark complete & continue"
   *  until the practice is done (run the timer, or Log it). */
  loggedPracticeIds?: string[]
  /** A banked-but-unfinished log today, keyed by practice id — a timer practice step then offers
   *  "Continue Practice" to resume the sit for the remaining time. */
  partialByPractice?: Record<string, PartialToday>
  /** Show a printable certificate on Journey completion (plan opt-in). */
  certificateEnabled?: boolean
  /** Phase-drip anchor (ISO): the Run's start (cohort) or the member's enrollment start (solo).
   *  null = no drip; every phase is open. */
  anchorStart?: string | null
  /** Days between phase unlocks (snapshot from the Run, else the plan default). */
  dripIntervalDays?: number
  /** The lesson to open on (the `?lesson=` deep link from the course home or the dock). Ignored
   *  when it is not in this Journey or sits in a locked phase. */
  initialLessonId?: string | null
}

// The drip copy is shared with the course home, so "Opens in 3 days" reads the same on both.
const unlockLabel = (d: Date | null): string => unlockLine(d)

// The undo affordance for a checked-off lesson. Deliberately QUIET: a link-weight control beside
// the primary action, never a button competing with "Continue". Undoing is a correction, not a
// thing the player should invite — the loud control stays the one that moves a member forward.
function UndoCheckOff({ onUndo, pending }: { onUndo: () => void; pending: boolean }) {
  return (
    <button
      type="button"
      onClick={onUndo}
      disabled={pending}
      className="text-body-sm font-medium text-muted underline-offset-2 transition-colors hover:text-text hover:underline disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Mark not done'}
    </button>
  )
}

// An interactive knowledge-check: pick an option → instant feedback + retry. Low-stakes by design
// (testing effect) — it never gates "Mark complete". Self-contained; the player remounts it per
// lesson via `key`. (Mirrors journey-player.tsx so the learn surface keeps the same behavior.)
function KnowledgeCheck({ config }: { config: CheckConfig }) {
  const [picked, setPicked] = useState<number | null>(null)
  const correct = picked !== null && picked === config.answer
  return (
    <div className="mt-5 max-w-prose space-y-3 rounded-card border border-border bg-surface-elevated/40 p-4">
      <p className="text-body-sm font-semibold text-text">{config.question}</p>
      <div className="space-y-2">
        {config.options.map((opt, i) => {
          const chosen = picked === i
          const isAnswer = i === config.answer
          let state = 'border-border bg-surface hover:bg-surface-elevated text-text'
          if (picked !== null) {
            if (isAnswer) state = 'border-success bg-surface text-success'
            else if (chosen) state = 'border-danger bg-surface text-danger'
            else state = 'border-border bg-surface text-muted opacity-70'
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => setPicked(i)}
              disabled={correct}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-body-sm transition-colors ${state}`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border border-current text-2xs font-bold">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="min-w-0 flex-1">{opt}</span>
              {picked !== null && isAnswer && <Check className="h-4 w-4 shrink-0 text-success" />}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <div className="rounded-lg border border-border bg-surface px-3 py-2 text-body-sm text-text">
          <span className={`font-semibold ${correct ? 'text-success' : 'text-text'}`}>{correct ? 'Correct.' : 'Not quite.'}</span>
          {config.explanation ? ` ${config.explanation}` : ''}
          {!correct && (
            <button type="button" onClick={() => setPicked(null)} className="ml-1.5 font-semibold text-primary-strong hover:underline">
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function LearnPlayer({
  slug,
  title,
  tree,
  lessonsById,
  detailById = {},
  phaseFocusById = {},
  pillarByLesson = {},
  practiceIdByLesson = {},
  usesTimerByLesson = {},
  anchorLessonId = null,
  phaseEventsById = {},
  loggedPracticeIds = [],
  partialByPractice = {},
  certificateEnabled = false,
  anchorStart = null,
  dripIntervalDays = 7,
  initialLessonId = null,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  // "Week" or "Month": the unit the cadence counts phases in, for the outline and the focus line.
  const unit = cadenceUnit(dripIntervalDays)
  const Unit = unit === 'month' ? 'Month' : 'Week'
  const mindless = useMindless()

  // A module's timed practices, in order, as a launchable sequence (ADR-592, P6). Returns the
  // ordered practice ids for the module's UNLOGGED timed-practice lessons; 2+ makes it a session.
  const moduleQueue = (lessonIds: string[]): string[] =>
    lessonIds
      .filter((id) => (usesTimerByLesson[id] ?? false) && practiceIdByLesson[id])
      .map((id) => practiceIdByLesson[id])

  const order = tree.lessonOrder
  const [milestone, setMilestone] = useState<TrophyMilestone | null>(null)
  const [tocOpen, setTocOpen] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  // A practice step's "Mark complete & continue" is gated until the practice is logged today (#7):
  // run the timer or tap Log it. `locallyLogged` reflects a just-logged practice instantly; the
  // server truth (loggedPracticeIds) catches up on router.refresh. `forceContinue` is the escape
  // hatch (#8): one click on the greyed button reveals "Continue without logging".
  const [locallyLogged, setLocallyLogged] = useState<Set<string>>(new Set())
  const [forceContinue, setForceContinue] = useState(false)
  const loggedSet = useMemo(
    () => new Set<string>([...loggedPracticeIds, ...locallyLogged]),
    [loggedPracticeIds, locallyLogged],
  )

  // Per-lesson status + which phase a lesson lives in (so navigating opens its phase).
  const { statusOf, phaseOfLesson } = useMemo(() => {
    const statusOf = new Map<string, { done: boolean }>()
    const phaseOfLesson = new Map<string, string>()
    for (const p of tree.phases)
      for (const m of p.modules)
        for (const l of m.lessons) {
          statusOf.set(l.id, { done: l.done })
          phaseOfLesson.set(l.id, p.id)
        }
    return { statusOf, phaseOfLesson }
  }, [tree])

  // Phase lock schedule: phase i unlocks at anchor + i·interval. No anchor → nothing locks.
  const phaseLock = useMemo(() => {
    const states = phaseLockStates(tree.phases.length, anchorStart, dripIntervalDays)
    return new Map(tree.phases.map((p, i) => [p.id, states[i]]))
  }, [tree, anchorStart, dripIntervalDays])

  const lessonLocked = (id: string | null) => {
    if (!id) return false
    const ph = phaseOfLesson.get(id)
    return ph ? phaseLock.get(ph)?.locked ?? false : false
  }

  // Start on the first not-done lesson in an UNLOCKED phase; never a locked lesson.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialLessonId && order.includes(initialLessonId) && !lessonLocked(initialLessonId)) return initialLessonId
    const firstOpenTodo = order.find((id) => !statusOf.get(id)?.done && !lessonLocked(id))
    if (firstOpenTodo) return firstOpenTodo
    for (let i = order.length - 1; i >= 0; i--) if (!lessonLocked(order[i])) return order[i]
    return order[0] ?? null
  })

  // The current phase starts expanded; a learner opens others as they go (progressive disclosure).
  const [openPhases, setOpenPhases] = useState<Set<string>>(() => {
    const ph = selectedId ? phaseOfLesson.get(selectedId) : null
    return new Set(ph ? [ph] : tree.phases[0] ? [tree.phases[0].id] : [])
  })

  const idx = selectedId ? order.indexOf(selectedId) : -1
  const lesson = selectedId ? lessonsById[selectedId] : null
  const isDone = selectedId ? statusOf.get(selectedId)?.done ?? false : false
  const nextId = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null
  const prevId = idx > 0 ? order[idx - 1] : null
  const nextLocked = lessonLocked(nextId)
  const selectedLocked = lessonLocked(selectedId)
  const video = lesson?.body && !selectedLocked ? parseVideoEmbed(lesson.body) : null
  const detail = selectedId && !selectedLocked ? detailById[selectedId] : null
  const selectedPhaseId = selectedId ? phaseOfLesson.get(selectedId) ?? '' : ''
  const phaseFocus = selectedPhaseId ? phaseFocusById[selectedPhaseId] : undefined
  const selectedPillar = selectedId ? pillarByLesson[selectedId] : undefined
  const selectedPracticeId = selectedId && !selectedLocked ? practiceIdByLesson[selectedId] : undefined
  const selectedUsesTimer = selectedId ? usesTimerByLesson[selectedId] ?? true : true
  const selectedPracticeLogged = selectedPracticeId ? loggedSet.has(selectedPracticeId) : true
  // Gate completion only on a practice step that isn't logged yet and isn't already done.
  const gateOnLog = !!selectedPracticeId && !selectedPracticeLogged && !isDone

  function togglePhase(id: string) {
    setOpenPhases((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Select a lesson and make sure its phase is open (covers next/prev jumps across phases).
  function goTo(id: string | null) {
    if (!id) return
    setSelectedId(id)
    setForceContinue(false)
    setTocOpen(false)
    const ph = phaseOfLesson.get(id)
    if (ph) setOpenPhases((prev) => (prev.has(ph) ? prev : new Set(prev).add(ph)))
    // The address follows the lesson, so a refresh, a share or Back lands on the same step. A plain
    // replaceState: no navigation, no server round trip (Next keeps useSearchParams in step with it).
    window.history.replaceState(null, '', `?lesson=${encodeURIComponent(id)}`)
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // Undo a check-off (SCAN-502). Nothing is clawed back — see the action's header: milestone Gems,
  // trophies and extra credit are once-ever, so reversing them would make correcting a mis-tap cost
  // a member more than never mis-tapping. This puts the tick and the progress bar back, no more.
  function undoComplete() {
    if (!selectedId) return
    start(async () => {
      const res = await uncompleteJourneyLessonAction(slug, selectedId)
      if (!isError(res)) router.refresh()
    })
  }

  function complete() {
    if (!selectedId || selectedLocked) return
    start(async () => {
      const res = await completeJourneyLessonAction(slug, selectedId)
      if (!isError(res)) {
        const ev = res.data.events
        const j = ev.find((e) => e.kind === 'journey_complete')
        const ph = ev.find((e) => e.kind === 'phase_complete')
        const gems = res.data.granted.reduce((s, g) => s + g.gems, 0)
        if (j) setMilestone({ kind: 'journey', title, gems, certificate: certificateEnabled })
        else if (ph) setMilestone({ kind: 'phase', title: ph.phaseTitle ?? 'Phase complete', gems })
        if (nextId && !lessonLocked(nextId)) goTo(nextId)
        router.refresh()
      }
    })
  }

  const lessonNo = idx >= 0 ? idx + 1 : 0

  return (
    // No local data-skin: the player is regular in-app content and inherits the active Space's
    // skin from the shell root (components/layout/app-shell.tsx).
    //
    // FOCUS MODE. The shell hides its header, rails and tab bar on this route (page-chrome's
    // full-viewport list), so the only chrome is this strip: the outline, Back and Next, and the
    // whole-Journey progress. The outline is a sheet, not a column, so the lesson keeps the centre
    // at a reading measure on every width (the Open edX finding: an outline you have to leave the
    // lesson to reach does not get used; one that is always open crowds the lesson).
    <div ref={topRef} className="scroll-mt-4">
      {milestone && <TrophyCelebration milestone={milestone} onDismiss={() => setMilestone(null)} />}

      <div className="sticky top-2 z-20 mb-5 flex items-center gap-2 rounded-pill border border-border bg-surface/95 p-1.5 shadow-pop backdrop-blur-sm">
        <Button type="button" variant="ghost" size="sm" onClick={() => setTocOpen(true)} aria-haspopup="dialog">
          <List className="h-4 w-4" aria-hidden /> Contents
        </Button>
        <span className="hidden shrink-0 text-meta tabular-nums text-muted sm:inline">
          Lesson {lessonNo} of {order.length}
        </span>
        <span className="min-w-0 flex-1 px-1">
          <ProgressTrack value={tree.percent} minVisible={2} label={`${tree.doneRequired} of ${tree.totalRequired} done`} size="sm" animate />
        </span>
        <span className="shrink-0 text-meta font-semibold tabular-nums text-text">{tree.percent}%</span>
        <IconButton label="Previous lesson" onClick={() => goTo(prevId)} disabled={!prevId}>
          <ChevronLeft className="h-4 w-4" />
        </IconButton>
        <IconButton label="Next lesson" onClick={() => goTo(nextId)} disabled={!nextId || nextLocked}>
          <ChevronRight className="h-4 w-4" />
        </IconButton>
      </div>

      <Dialog open={tocOpen} onClose={() => setTocOpen(false)} ariaLabel="Contents" align="bottom" className="sm:max-w-md">
        <div className="max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-card bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-pop-lg sm:rounded-card">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-body font-semibold text-text">Contents</p>
            <span className="ml-auto text-meta tabular-nums text-muted">
              {tree.doneRequired} of {tree.totalRequired} done
            </span>
            <IconButton label="Close contents" onClick={() => setTocOpen(false)}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
            {/* Syllabus — progressive disclosure: caret-collapsible Phases, current Phase open. */}
            <nav aria-label="Contents" className="space-y-2">
              {tree.phases.map((p, pi) => {
                const open = openPhases.has(p.id)
                const lock = phaseLock.get(p.id)
                const locked = lock?.locked ?? false
                return (
                  <div key={p.id} className="overflow-hidden rounded-card border border-border bg-surface">
                    <button
                      type="button"
                      onClick={() => togglePhase(p.id)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated"
                    >
                      <ChevronDown className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? '' : '-rotate-90'}`} />
                      <span className="min-w-0 flex-1">
                        {/* The "Week N" eyebrow only when the phase is a real, titled phase (a flat/
                            legacy journey has one untitled implicit phase — no week label there). */}
                        {p.title && p.title.trim().toLowerCase() !== `${unit} ${pi + 1}` && (
                          <span className="block text-2xs font-semibold uppercase tracking-wide text-muted">
                            {Unit} {pi + 1}
                          </span>
                        )}
                        <span className="block truncate text-body-sm font-semibold text-text">{p.title || `Phase ${pi + 1}`}</span>
                        {locked && <span className="block text-2xs font-medium text-muted">{unlockLabel(lock?.unlockAt ?? null)}</span>}
                      </span>
                      {locked ? (
                        <Lock className="h-4 w-4 shrink-0 text-subtle" />
                      ) : p.complete ? (
                        <Check className="h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <span className="shrink-0 tabular-nums text-2xs text-muted">{p.doneRequired}/{p.totalRequired}</span>
                      )}
                    </button>

                    {open && (
                      <div className="space-y-2 border-t border-border px-1.5 pb-2 pt-1.5">
                        {/* The week's focus — the phase body, so the syllabus reads as a course arc. */}
                        {!locked && phaseFocusById[p.id] && (
                          <p className="px-2 pt-1 text-2xs leading-relaxed text-muted">{phaseFocusById[p.id]}</p>
                        )}
                        {/* This week's scheduled touchpoints (ADR-307): the dated Circle Meetup + Gathering. */}
                        {!locked && (phaseEventsById[p.id]?.meetup || phaseEventsById[p.id]?.gathering) && (
                          <div className="space-y-0.5 px-2 pt-1">
                            {(['meetup', 'gathering'] as const).map((k) => {
                              const ev = phaseEventsById[p.id]?.[k]
                              if (!ev) return null
                              return (
                                <a key={k} href={`/events/${ev.slug}`} className="flex items-center gap-1.5 text-2xs text-primary-strong hover:underline">
                                  <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
                                  {k === 'meetup' ? 'Circle Meetup' : 'Weekend Gathering'}:{' '}
                                  {new Date(ev.startsAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                </a>
                              )
                            })}
                          </div>
                        )}
                        {p.modules.map((m) => (
                          <div key={m.id}>
                            {m.title && (
                              <p className="px-2 pb-0.5 pt-1 text-2xs font-semibold uppercase tracking-wide text-muted">{m.title}</p>
                            )}
                            <ul className="space-y-0.5">
                              {m.lessons.map((l) => {
                                if (locked) {
                                  return (
                                    <li key={l.id}>
                                      <div aria-disabled="true" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-body-sm text-subtle opacity-70">
                                        <Lock className="h-3.5 w-3.5 shrink-0" />
                                        <span className="min-w-0 truncate">{l.title}</span>
                                      </div>
                                    </li>
                                  )
                                }
                                const active = l.id === selectedId
                                const pillar = pillarByLesson[l.id]
                                return (
                                  <li key={l.id}>
                                    <button
                                      type="button"
                                      onClick={() => goTo(l.id)}
                                      aria-current={active ? 'true' : undefined}
                                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-body-sm transition-colors ${
                                        active ? 'bg-primary-bg font-medium text-primary-strong' : 'text-text hover:bg-surface-elevated'
                                      }`}
                                    >
                                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-pill border ${l.done ? 'border-success bg-success text-on-success' : active ? 'border-primary' : 'border-border'}`}>
                                        {l.done && <Check className="h-2.5 w-2.5" />}
                                      </span>
                                      <span className="min-w-0 flex-1 truncate">{l.title}</span>
                                      {l.id === anchorLessonId && (
                                        <Anchor className="h-3 w-3 shrink-0 text-primary-strong" aria-label="Daily anchor" />
                                      )}
                                      {pillar && (
                                        <span className="shrink-0 rounded-pill bg-surface-elevated px-1.5 py-0.5 text-3xs font-medium text-muted">
                                          {pillar}
                                        </span>
                                      )}
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                            {/* Sequenced run (ADR-592, P6): a module with 2+ timed practices can be run
                                back to back as one session, auto-advancing at each reveal. */}
                            {!locked && (() => {
                              const q = moduleQueue(m.lessons.map((l) => l.id))
                              if (q.length < 2) return null
                              return (
                                <button
                                  type="button"
                                  onClick={() => mindless.open({ queue: q })}
                                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-meta font-semibold text-primary-strong transition-colors hover:bg-primary-bg"
                                >
                                  <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden /> Start all {q.length} as one session
                                </button>
                              )
                            })()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>

        </div>
      </Dialog>

      <div className="mx-auto max-w-3xl">
          {/* Lesson pane — one idea, one action. Reading content at a ~prose measure (rule 2). */}
          <article className="rounded-card border border-border bg-surface p-5 sm:p-8">
            {!lesson ? (
              <p className="text-body-sm text-muted">This journey has no lessons yet.</p>
            ) : selectedLocked ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Lock className="h-6 w-6 text-subtle" />
                <p className="text-body-sm font-semibold text-text">This phase is still locked</p>
                <p className="max-w-prose text-body-sm text-muted">
                  {unlockLabel(phaseLock.get(phaseOfLesson.get(selectedId!) ?? '')?.unlockAt ?? null)}. One phase opens at a time, so the whole Circle moves together. Catch up on the current phase while you wait.
                </p>
              </div>
            ) : (
              <>
                {/* The week's focus — orients the follower before the step. */}
                {phaseFocus && (
                  <div className="mb-4 flex items-start gap-2 rounded-card border border-border bg-surface-elevated/40 p-3">
                    <Compass className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                    <p className="text-body-sm leading-relaxed text-muted">
                      <span className="font-semibold text-text">This {unit}:</span> {phaseFocus}
                    </p>
                  </div>
                )}

                <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
                  Lesson {idx + 1} of {order.length}{lesson.estMinutes ? ` · ${lesson.estMinutes} min` : ''}{lesson.required ? '' : ' · optional'}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-lead font-bold text-text">{lesson.title}</h2>
                  {selectedId === anchorLessonId && (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
                      <Anchor className="h-3 w-3" aria-hidden /> Daily anchor
                    </span>
                  )}
                  {selectedPillar && (
                    <span className="rounded-pill bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">{selectedPillar}</span>
                  )}
                </div>
                {selectedId === anchorLessonId && (
                  <p className="mt-1 text-meta text-muted">Your through-line. Do this one every day, all the way through.</p>
                )}

                {/* Extra-credit badge: a bonus task, above and beyond, that pays Zaps once on
                    completion. Optional, never gates finishing the Journey. */}
                {lesson.extraCredit && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-pill border border-signal/30 bg-signal-bg/50 px-2.5 py-1 text-meta font-semibold text-signal-strong">
                    <Award className="h-3.5 w-3.5" aria-hidden /> Extra credit{lesson.bonusZaps > 0 ? ` · +${lesson.bonusZaps} Zaps` : ''}
                  </div>
                )}

                {/* KEEP bg-black: the letterbox behind a video frame, which is black on every generation. */}
                {video && (
                  <div className="mt-4 aspect-video overflow-hidden rounded-card bg-black">
                    {video.provider === 'file' ? (
                      <video src={video.url} controls className="h-full w-full" />
                    ) : (
                      <iframe
                        src={video.src}
                        title={lesson.title}
                        allowFullScreen
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      />
                    )}
                  </div>
                )}

                {/* Prose body — only when it isn't a bare video URL; constrained measure + text-body.
                    (Lesson / extra-credit blocks carry their own body here; practice steps render
                    their full library write-up in the pre-rendered detail node below.) */}
                {lesson.body && !video && (
                  <div className="mt-4 max-w-prose whitespace-pre-wrap text-body leading-relaxed text-text">{lesson.body}</div>
                )}

                {/* Rich, server-rendered detail for the step (the practice write-up: summary ·
                    cadence · time · Pillar · "Why it works / How to do it / In The Quest"). */}
                {detail}

                {/* The step's single practice action — Practice (opens the Mindless timer pre-set to
                    this practice) for a timer practice, or Log it for the rest. Logging it clears the
                    "Mark complete & continue" gate below. */}
                {selectedPracticeId && (
                  <div className="mt-4 max-w-prose">
                    <PracticeActions
                      key={selectedPracticeId}
                      practiceId={selectedPracticeId}
                      usesTimer={selectedUsesTimer}
                      pillar={selectedPillar}
                      logged={selectedPracticeLogged}
                      partialToday={partialByPractice[selectedPracticeId] ?? null}
                      warmupMessage={lesson.warmupMessage}
                      onLogged={(pid) => setLocallyLogged((s) => new Set(s).add(pid))}
                    />
                  </div>
                )}

                {/* Vera's per-slot coaching nudge (practice steps) — the author's dynamically-drafted
                    line for this practice, grounded in the season + Pillar. */}
                {lesson.coachingPrompt && (
                  <div className="mt-4 flex max-w-prose items-start gap-2 rounded-xl border border-primary/20 bg-primary-bg/30 p-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                    <p className="text-body-sm leading-relaxed text-text">{lesson.coachingPrompt}</p>
                  </div>
                )}

                {/* Interactive knowledge-check, when this check has a question. */}
                {lesson.type === 'check' && lesson.check && <KnowledgeCheck key={selectedId} config={lesson.check} />}

                {/* Completion gate (#8): a practice step warns once before letting you skip logging. */}
                {gateOnLog && forceContinue && (
                  <div className="mt-5 flex max-w-prose items-start gap-2 rounded-xl border border-warning/30 bg-warning-bg/30 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                    <p className="text-body-sm leading-relaxed text-text">
                      You haven&rsquo;t logged this practice yet. {selectedUsesTimer ? 'Run the timer' : 'Tap Log it'} above so it counts toward your Pillar balance, or continue without logging.
                    </p>
                  </div>
                )}

                {/* One clear next action */}
                <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
                  {prevId && (
                    <button type="button" onClick={() => goTo(prevId)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-body-sm text-muted hover:text-text">
                      <ChevronLeft className="h-4 w-4" /> Back
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {isDone ? (
                      nextId && nextLocked ? (
                        <span className="inline-flex items-center gap-1.5 text-body-sm font-medium text-subtle">
                          <Lock className="h-4 w-4" /> {unlockLabel(phaseLock.get(phaseOfLesson.get(nextId) ?? '')?.unlockAt ?? null)}
                        </span>
                      ) : nextId ? (
                        <div className="flex items-center gap-3">
                          <UndoCheckOff onUndo={undoComplete} pending={pending} />
                          <Button type="button" onClick={() => goTo(nextId)}>
                            Continue <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <UndoCheckOff onUndo={undoComplete} pending={pending} />
                          <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-success"><Check className="h-4 w-4" /> Completed</span>
                        </div>
                      )
                    ) : gateOnLog && !forceContinue ? (
                      // Grey until the practice is logged (#7). A first click reveals the escape hatch.
                      <button
                        type="button"
                        onClick={() => setForceContinue(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-4 py-2 text-body-sm font-semibold text-muted transition-colors hover:text-text"
                      >
                        <Check className="h-4 w-4" /> Mark complete & continue
                      </button>
                    ) : gateOnLog && forceContinue ? (
                      // Escape hatch (#8): complete without logging, after the warning above.
                      <button
                        type="button"
                        onClick={complete}
                        disabled={pending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-warning/50 bg-surface px-4 py-2 text-body-sm font-semibold text-warning transition-colors hover:bg-warning-bg/40 disabled:opacity-60"
                      >
                        {pending ? 'Saving…' : 'Continue without logging'}
                      </button>
                    ) : (
                      <Button type="button" onClick={complete} disabled={pending}>
                        <Check className="h-4 w-4" /> {pending ? 'Saving…' : 'Mark complete & continue'}
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </article>
      </div>
    </div>
  )
}
