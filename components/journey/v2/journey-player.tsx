'use client'

// Journeys v2 — the lesson player (ADR-252, J1b, JOURNEYS.md §5; design rules in
// docs/JOURNEYS-DESIGN.md). A clean learning surface: a progressive-disclosure syllabus
// (Phase accordion → Module → Lesson, with done/current/LOCKED states and per-phase counts)
// and the active lesson with ONE clear next action. Phases drip on a schedule (build item
// §11.1 #1): given a Run/solo anchor + interval, future Phases lock and show "unlocks in N days"
// (lib/journeys/schedule.ts). Reading content sits at a ~prose measure in text-base; on mobile
// the syllabus collapses behind a Contents drawer. Minimal client state (selected lesson + which
// phases are open); progress + completion + the lock schedule come from the server.

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, ChevronDown, List, Lock, Sparkles } from 'lucide-react'
import { parseVideoEmbed } from '@/lib/video-embed'
import { isError } from '@/lib/action-result'
import { phaseUnlockAt, isPhaseUnlocked } from '@/lib/journeys/schedule'
import { completeJourneyLessonAction } from '@/app/(main)/journeys/[slug]/learn/actions'
import { TrophyCelebration, type TrophyMilestone } from './trophy-celebration'
import type { JourneyTree } from '@/lib/journeys/tree'
import type { LessonContent, CheckConfig } from '@/lib/journeys/store'

interface Props {
  slug: string
  /** The journey's name — used only for the completion celebration (the page header
   *  carries the visible title now, so the progress card doesn't repeat it). */
  title: string
  tree: JourneyTree
  lessonsById: Record<string, LessonContent>
  /** Show a printable certificate on Journey completion (plan opt-in). */
  certificateEnabled?: boolean
  /** Phase-drip anchor (ISO): the Run's start (cohort) or the member's enrollment start
   *  (solo). null = no drip; every phase is open. */
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

// An interactive knowledge-check (build item §11.1 #2): pick an option → instant feedback +
// retry. Low-stakes by design (testing effect, docs/JOURNEYS-DESIGN.md §1) — it never gates the
// "Mark complete" action. Self-contained state; the player remounts it per lesson via `key`.
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

export function JourneyPlayer({ slug, title, tree, lessonsById, certificateEnabled = false, anchorStart = null, dripIntervalDays = 7 }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const order = tree.lessonOrder
  const [milestone, setMilestone] = useState<TrophyMilestone | null>(null)
  const [mobileToc, setMobileToc] = useState(false)

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
    // No local data-skin: the player is regular in-app content and inherits the
    // active Space's skin from the shell root (components/layout/app-shell.tsx).
    // The previous hardcoded `data-skin="default"` predated the skin registry and
    // wrongly pinned the Dawn look inside a non-default Space (e.g. Midnight).
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
                                  <span className="min-w-0 truncate">{l.title}</span>
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
              <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
                Lesson {idx + 1} of {order.length}{lesson.estMinutes ? ` · ${lesson.estMinutes} min` : ''}{lesson.required ? '' : ' · optional'}
              </p>
              <h2 className="mt-1 text-xl font-bold text-text">{lesson.title}</h2>

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

              {/* Prose body — only when it isn't a bare video URL; constrained measure + text-base. */}
              {lesson.body && !video && (
                <div className="mt-4 max-w-prose whitespace-pre-wrap text-base leading-relaxed text-text">{lesson.body}</div>
              )}

              {/* Vera's per-slot coaching nudge (practice steps) — the author's dynamically-drafted
                  line for this practice, grounded in the season + Pillar. */}
              {lesson.coachingPrompt && (
                <div className="mt-4 flex max-w-prose items-start gap-2 rounded-xl border border-primary/20 bg-primary-bg/30 p-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                  <p className="text-sm leading-relaxed text-text">{lesson.coachingPrompt}</p>
                </div>
              )}

              {/* Interactive knowledge-check (build item §11.1 #2), when this check has a question. */}
              {lesson.type === 'check' && lesson.check && <KnowledgeCheck key={selectedId} config={lesson.check} />}

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
