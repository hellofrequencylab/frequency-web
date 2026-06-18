'use client'

// Journeys v2 — the LEARN player (the "follow-along course" overhaul of the lesson player). A
// richer sibling of components/journey/v2/journey-player.tsx: it keeps the working surface intact
// (progressive-disclosure Phase → Module → Lesson syllabus, drip lock, the "Mark complete &
// continue" completion flow via completeJourneyLessonAction, the trophy celebration) and layers
// in the cohesion a follower needs — each week's focus copy, a Pillar badge on practice steps, and
// the real practice/lesson content in the lesson pane (the rich detail is PRE-RENDERED on the
// server and handed in as a node map, the RSC interleaving pattern, so this client bundle stays
// lean). Minimal client state: selected lesson + open phases; progress + lock come from the server.

import { useState, useTransition, useMemo, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, ChevronDown, List, Lock, Sparkles, Award, Compass, AlertTriangle } from 'lucide-react'
import { parseVideoEmbed } from '@/lib/video-embed'
import { isError } from '@/lib/action-result'
import { phaseUnlockAt, isPhaseUnlocked } from '@/lib/journeys/schedule'
import { completeJourneyLessonAction } from '@/app/(main)/journeys/[slug]/learn/actions'
import { TrophyCelebration, type TrophyMilestone } from '@/components/journey/v2/trophy-celebration'
import { PracticeActions } from '@/components/journey/v2/learn/practice-actions'
import type { JourneyTree } from '@/lib/journeys/tree'
import type { LessonContent, CheckConfig } from '@/lib/journeys/store'

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
  /** Practice ids the member has logged TODAY — gates a practice step's "Mark complete & continue"
   *  until the practice is done (run the timer, or Log it). */
  loggedPracticeIds?: string[]
  /** Show a printable certificate on Journey completion (plan opt-in). */
  certificateEnabled?: boolean
  /** Phase-drip anchor (ISO): the Run's start (cohort) or the member's enrollment start (solo).
   *  null = no drip; every phase is open. */
  anchorStart?: string | null
  /** Days between phase unlocks (snapshot from the Run, else the plan default). */
  dripIntervalDays?: number
}

function unlockLabel(d: Date | null): string {
  if (!d) return 'Locked'
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
  if (days <= 0) return 'Unlocking now'
  if (days === 1) return 'Unlocks tomorrow'
  return `Unlocks in ${days} days`
}

// An interactive knowledge-check: pick an option → instant feedback + retry. Low-stakes by design
// (testing effect) — it never gates "Mark complete". Self-contained; the player remounts it per
// lesson via `key`. (Mirrors journey-player.tsx so the learn surface keeps the same behavior.)
function KnowledgeCheck({ config }: { config: CheckConfig }) {
  const [picked, setPicked] = useState<number | null>(null)
  const correct = picked !== null && picked === config.answer
  return (
    <div className="mt-5 max-w-prose space-y-3 rounded-xl border border-border bg-surface-elevated/40 p-4">
      <p className="text-sm font-semibold text-text">{config.question}</p>
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
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${state}`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-2xs font-bold">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="min-w-0 flex-1">{opt}</span>
              {picked !== null && isAnswer && <Check className="h-4 w-4 shrink-0 text-success" />}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text">
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
  loggedPracticeIds = [],
  certificateEnabled = false,
  anchorStart = null,
  dripIntervalDays = 7,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const order = tree.lessonOrder
  const [milestone, setMilestone] = useState<TrophyMilestone | null>(null)
  const [mobileToc, setMobileToc] = useState(false)

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
    const a = anchorStart ? new Date(anchorStart) : null
    const m = new Map<string, { locked: boolean; unlockAt: Date | null }>()
    tree.phases.forEach((p, i) => {
      if (!a) m.set(p.id, { locked: false, unlockAt: null })
      else m.set(p.id, { locked: !isPhaseUnlocked(a, i, dripIntervalDays), unlockAt: phaseUnlockAt(a, i, dripIntervalDays) })
    })
    return m
  }, [tree, anchorStart, dripIntervalDays])

  const lessonLocked = (id: string | null) => {
    if (!id) return false
    const ph = phaseOfLesson.get(id)
    return ph ? phaseLock.get(ph)?.locked ?? false : false
  }

  // Start on the first not-done lesson in an UNLOCKED phase; never a locked lesson.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
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
    setMobileToc(false)
    const ph = phaseOfLesson.get(id)
    if (ph) setOpenPhases((prev) => (prev.has(ph) ? prev : new Set(prev).add(ph)))
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

  return (
    // No local data-skin: the player is regular in-app content and inherits the active Space's
    // skin from the shell root (components/layout/app-shell.tsx).
    <div className="space-y-4">
      {milestone && <TrophyCelebration milestone={milestone} onDismiss={() => setMilestone(null)} />}

      {/* Progress header — never-empty bar (endowed-progress effect, docs/JOURNEYS-DESIGN.md §1). */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-text">Your progress</span>
          <span className="tabular-nums text-muted">{tree.doneRequired} of {tree.totalRequired} done</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(2, tree.percent)}%` }} />
        </div>
      </div>

      {/* Mobile: the syllabus is a drawer, collapsed by default (don't push the lesson down). */}
      <button
        type="button"
        onClick={() => setMobileToc((v) => !v)}
        aria-expanded={mobileToc}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-medium text-text lg:hidden"
      >
        <List className="h-4 w-4 text-subtle" />
        Contents
        <span className="ml-auto tabular-nums text-2xs text-subtle">{idx >= 0 ? idx + 1 : 0} / {order.length}</span>
        <ChevronDown className={`h-4 w-4 text-subtle transition-transform ${mobileToc ? '' : '-rotate-90'}`} />
      </button>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Syllabus — progressive disclosure: caret-collapsible Phases, current Phase open. */}
        <nav className={`${mobileToc ? 'block' : 'hidden'} space-y-2 lg:block lg:max-h-[72vh] lg:overflow-y-auto lg:pr-1`}>
          {tree.phases.map((p, pi) => {
            const open = openPhases.has(p.id)
            const lock = phaseLock.get(p.id)
            const locked = lock?.locked ?? false
            return (
              <div key={p.id} className="overflow-hidden rounded-xl border border-border bg-surface">
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
                    {p.title && <span className="block text-2xs font-semibold uppercase tracking-wide text-subtle">Week {pi + 1}</span>}
                    <span className="block truncate text-sm font-semibold text-text">{p.title || `Phase ${pi + 1}`}</span>
                    {locked && <span className="block text-2xs font-medium text-subtle">{unlockLabel(lock?.unlockAt ?? null)}</span>}
                  </span>
                  {locked ? (
                    <Lock className="h-4 w-4 shrink-0 text-subtle" />
                  ) : p.complete ? (
                    <Check className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <span className="shrink-0 tabular-nums text-2xs text-subtle">{p.doneRequired}/{p.totalRequired}</span>
                  )}
                </button>

                {open && (
                  <div className="space-y-2 border-t border-border px-1.5 pb-2 pt-1.5">
                    {/* The week's focus — the phase body, so the syllabus reads as a course arc. */}
                    {!locked && phaseFocusById[p.id] && (
                      <p className="px-2 pt-1 text-2xs leading-relaxed text-muted">{phaseFocusById[p.id]}</p>
                    )}
                    {p.modules.map((m) => (
                      <div key={m.id}>
                        {m.title && (
                          <p className="px-2 pb-0.5 pt-1 text-2xs font-semibold uppercase tracking-wide text-subtle">{m.title}</p>
                        )}
                        <ul className="space-y-0.5">
                          {m.lessons.map((l) => {
                            if (locked) {
                              return (
                                <li key={l.id}>
                                  <div aria-disabled="true" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-subtle opacity-70">
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
                                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                                    active ? 'bg-primary-bg font-medium text-primary-strong' : 'text-text hover:bg-surface-elevated'
                                  }`}
                                >
                                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${l.done ? 'border-success bg-success text-on-primary' : active ? 'border-primary' : 'border-border'}`}>
                                    {l.done && <Check className="h-2.5 w-2.5" />}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                                  {pillar && (
                                    <span className="shrink-0 rounded-full bg-surface-elevated px-1.5 py-0.5 text-3xs font-medium text-subtle">
                                      {pillar}
                                    </span>
                                  )}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Lesson pane — one idea, one action. Reading content at a ~prose measure (rule 2). */}
        <article className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          {!lesson ? (
            <p className="text-sm text-muted">This journey has no lessons yet.</p>
          ) : selectedLocked ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Lock className="h-6 w-6 text-subtle" />
              <p className="text-sm font-semibold text-text">This phase is still locked</p>
              <p className="max-w-prose text-sm text-muted">
                {unlockLabel(phaseLock.get(phaseOfLesson.get(selectedId!) ?? '')?.unlockAt ?? null)}. One phase opens at a time, so the whole Circle moves together. Catch up on the current phase while you wait.
              </p>
            </div>
          ) : (
            <>
              {/* The week's focus — orients the follower before the step. */}
              {phaseFocus && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-surface-elevated/40 p-3">
                  <Compass className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                  <p className="text-sm leading-relaxed text-muted">
                    <span className="font-semibold text-text">This week:</span> {phaseFocus}
                  </p>
                </div>
              )}

              <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
                Lesson {idx + 1} of {order.length}{lesson.estMinutes ? ` · ${lesson.estMinutes} min` : ''}{lesson.required ? '' : ' · optional'}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-text">{lesson.title}</h2>
                {selectedPillar && (
                  <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">{selectedPillar}</span>
                )}
              </div>

              {/* Extra-credit badge: a bonus task, above and beyond, that pays Zaps once on
                  completion. Optional, never gates finishing the Journey. */}
              {lesson.extraCredit && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal-bg/50 px-2.5 py-1 text-xs font-semibold text-signal-strong">
                  <Award className="h-3.5 w-3.5" aria-hidden /> Extra credit{lesson.bonusZaps > 0 ? ` · +${lesson.bonusZaps} Zaps` : ''}
                </div>
              )}

              {video && (
                <div className="mt-4 aspect-video overflow-hidden rounded-xl bg-black">
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

              {/* Prose body — only when it isn't a bare video URL; constrained measure + text-base.
                  (Lesson / extra-credit blocks carry their own body here; practice steps render
                  their full library write-up in the pre-rendered detail node below.) */}
              {lesson.body && !video && (
                <div className="mt-4 max-w-prose whitespace-pre-wrap text-base leading-relaxed text-text">{lesson.body}</div>
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
                    onLogged={(pid) => setLocallyLogged((s) => new Set(s).add(pid))}
                  />
                </div>
              )}

              {/* Vera's per-slot coaching nudge (practice steps) — the author's dynamically-drafted
                  line for this practice, grounded in the season + Pillar. */}
              {lesson.coachingPrompt && (
                <div className="mt-4 flex max-w-prose items-start gap-2 rounded-xl border border-primary/20 bg-primary-bg/30 p-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                  <p className="text-sm leading-relaxed text-text">{lesson.coachingPrompt}</p>
                </div>
              )}

              {/* Interactive knowledge-check, when this check has a question. */}
              {lesson.type === 'check' && lesson.check && <KnowledgeCheck key={selectedId} config={lesson.check} />}

              {/* Completion gate (#8): a practice step warns once before letting you skip logging. */}
              {gateOnLog && forceContinue && (
                <div className="mt-5 flex max-w-prose items-start gap-2 rounded-xl border border-warning/30 bg-warning-bg/30 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  <p className="text-sm leading-relaxed text-text">
                    You haven&rsquo;t logged this practice yet. {selectedUsesTimer ? 'Run the timer' : 'Tap Log it'} above so it counts toward your Pillar balance, or continue without logging.
                  </p>
                </div>
              )}

              {/* One clear next action */}
              <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
                {prevId && (
                  <button type="button" onClick={() => goTo(prevId)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-muted hover:text-text">
                    <ChevronLeft className="h-4 w-4" /> Back
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {isDone ? (
                    nextId && nextLocked ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-subtle">
                        <Lock className="h-4 w-4" /> {unlockLabel(phaseLock.get(phaseOfLesson.get(nextId) ?? '')?.unlockAt ?? null)}
                      </span>
                    ) : nextId ? (
                      <button type="button" onClick={() => goTo(nextId)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover">
                        Continue <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-success"><Check className="h-4 w-4" /> Completed</span>
                    )
                  ) : gateOnLog && !forceContinue ? (
                    // Grey until the practice is logged (#7). A first click reveals the escape hatch.
                    <button
                      type="button"
                      onClick={() => setForceContinue(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-4 py-2 text-sm font-semibold text-muted transition-colors hover:text-text"
                    >
                      <Check className="h-4 w-4" /> Mark complete & continue
                    </button>
                  ) : gateOnLog && forceContinue ? (
                    // Escape hatch (#8): complete without logging, after the warning above.
                    <button
                      type="button"
                      onClick={complete}
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-warning/50 bg-surface px-4 py-2 text-sm font-semibold text-warning transition-colors hover:bg-warning-bg/40 disabled:opacity-60"
                    >
                      {pending ? 'Saving…' : 'Continue without logging'}
                    </button>
                  ) : (
                    <button type="button" onClick={complete} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">
                      <Check className="h-4 w-4" /> {pending ? 'Saving…' : 'Mark complete & continue'}
                    </button>
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
