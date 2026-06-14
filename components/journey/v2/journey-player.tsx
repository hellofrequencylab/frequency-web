'use client'

// Journeys v2 — the lesson player (ADR-252, J1b, JOURNEYS.md §5; design rules in
// docs/JOURNEYS-DESIGN.md). A clean learning surface: a progressive-disclosure syllabus
// (Phase accordion → Module → Lesson, with done/current states and per-phase counts) and
// the active lesson with ONE clear next action. Reading content sits at a ~prose measure
// (~65ch) in text-base for legibility; on mobile the syllabus collapses behind a Contents
// drawer. Presentational + minimal client state (the selected lesson + which phases are open);
// progress + completion come from the server tree.

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, ChevronDown, List } from 'lucide-react'
import { parseVideoEmbed } from '@/lib/video-embed'
import { isError } from '@/lib/action-result'
import { completeJourneyLessonAction } from '@/app/(main)/journeys/[slug]/learn/actions'
import { TrophyCelebration, type TrophyMilestone } from './trophy-celebration'
import type { JourneyTree } from '@/lib/journeys/tree'
import type { LessonContent } from '@/lib/journeys/store'

interface Props {
  slug: string
  /** The journey's name — used only for the completion celebration (the page header
   *  carries the visible title now, so the progress card doesn't repeat it). */
  title: string
  tree: JourneyTree
  lessonsById: Record<string, LessonContent>
  /** Show a printable certificate on Journey completion (plan opt-in). */
  certificateEnabled?: boolean
}

export function JourneyPlayer({ slug, title, tree, lessonsById, certificateEnabled = false }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const order = tree.lessonOrder
  const [selectedId, setSelectedId] = useState<string | null>(tree.currentLessonId ?? order[0] ?? null)
  const [milestone, setMilestone] = useState<TrophyMilestone | null>(null)
  const [mobileToc, setMobileToc] = useState(false)

  // Per-lesson status (content bodies come from lessonsById) + which phase a lesson lives in,
  // so navigating to a lesson can open its (collapsed) phase.
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

  // The current phase starts expanded; a learner opens others as they go (progressive disclosure).
  const [openPhases, setOpenPhases] = useState<Set<string>>(() => {
    const cur = tree.currentLessonId ?? order[0] ?? null
    const ph = cur ? phaseOfLesson.get(cur) : null
    return new Set(ph ? [ph] : tree.phases[0] ? [tree.phases[0].id] : [])
  })

  const idx = selectedId ? order.indexOf(selectedId) : -1
  const lesson = selectedId ? lessonsById[selectedId] : null
  const isDone = selectedId ? statusOf.get(selectedId)?.done ?? false : false
  const nextId = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null
  const prevId = idx > 0 ? order[idx - 1] : null
  const video = lesson?.body ? parseVideoEmbed(lesson.body) : null

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
    if (!selectedId) return
    start(async () => {
      const res = await completeJourneyLessonAction(slug, selectedId)
      if (!isError(res)) {
        const ev = res.data.events
        const j = ev.find((e) => e.kind === 'journey_complete')
        const ph = ev.find((e) => e.kind === 'phase_complete')
        const gems = res.data.granted.reduce((s, g) => s + g.gems, 0)
        if (j) setMilestone({ kind: 'journey', title, gems, certificate: certificateEnabled })
        else if (ph) setMilestone({ kind: 'phase', title: ph.phaseTitle ?? 'Phase complete', gems })
        if (nextId) goTo(nextId)
        router.refresh()
      }
    })
  }

  return (
    <div data-skin="default" className="space-y-4">
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
            return (
              <div key={p.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => togglePhase(p.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated"
                >
                  <ChevronDown className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? '' : '-rotate-90'}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{p.title || `Phase ${pi + 1}`}</span>
                  {p.complete ? (
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
          {lesson ? (
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

              {/* One clear next action */}
              <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
                {prevId && (
                  <button type="button" onClick={() => goTo(prevId)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-muted hover:text-text">
                    <ChevronLeft className="h-4 w-4" /> Back
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {isDone ? (
                    nextId ? (
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
          ) : (
            <p className="text-sm text-muted">This journey has no lessons yet.</p>
          )}
        </article>
      </div>
    </div>
  )
}
