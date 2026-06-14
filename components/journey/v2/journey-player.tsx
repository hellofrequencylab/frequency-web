'use client'

// Journeys v2 — the lesson player (ADR-252, J1b, JOURNEYS.md §5). A clean two-pane learning
// surface: the syllabus (Phase → Module → Lesson) with progress on the left, and the active
// lesson with ONE clear next action on the right. Renders the pure read-model (tree.ts) and
// fires the complete action, celebrating phase/journey milestones. Presentational + minimal
// client state (the selected lesson); progress + completion come from the server tree.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { parseVideoEmbed } from '@/lib/video-embed'
import { isError } from '@/lib/action-result'
import { completeJourneyLessonAction } from '@/app/(main)/journeys/[slug]/learn/actions'
import { TrophyCelebration, type TrophyMilestone } from './trophy-celebration'
import type { JourneyTree } from '@/lib/journeys/tree'
import type { LessonContent } from '@/lib/journeys/store'

interface Props {
  slug: string
  title: string
  emoji?: string | null
  tree: JourneyTree
  lessonsById: Record<string, LessonContent>
  /** Show a printable certificate on Journey completion (plan opt-in). */
  certificateEnabled?: boolean
}

export function JourneyPlayer({ slug, title, emoji, tree, lessonsById, certificateEnabled = false }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const order = tree.lessonOrder
  const [selectedId, setSelectedId] = useState<string | null>(tree.currentLessonId ?? order[0] ?? null)
  const [milestone, setMilestone] = useState<TrophyMilestone | null>(null)

  // Per-lesson title/status from the tree (content bodies come from lessonsById).
  const statusOf = new Map<string, { title: string; done: boolean }>()
  for (const p of tree.phases) for (const m of p.modules) for (const l of m.lessons) statusOf.set(l.id, { title: l.title, done: l.done })

  const idx = selectedId ? order.indexOf(selectedId) : -1
  const lesson = selectedId ? lessonsById[selectedId] : null
  const isDone = selectedId ? statusOf.get(selectedId)?.done ?? false : false
  const nextId = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null
  const prevId = idx > 0 ? order[idx - 1] : null
  const video = lesson?.body ? parseVideoEmbed(lesson.body) : null

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
        if (nextId) setSelectedId(nextId)
        router.refresh()
      }
    })
  }

  return (
    <div data-skin="default" className="space-y-4">
      {milestone && <TrophyCelebration milestone={milestone} onDismiss={() => setMilestone(null)} />}

      {/* Progress header — never-empty bar (endowed-progress effect). */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-text">{emoji ? `${emoji} ` : ''}{title}</span>
          <span className="tabular-nums text-muted">{tree.doneRequired} of {tree.totalRequired} done</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(2, tree.percent)}%` }} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Syllabus */}
        <nav className="space-y-4 lg:max-h-[70vh] lg:overflow-y-auto">
          {tree.phases.map((p, pi) => (
            <div key={p.id}>
              {p.title && (
                <p className="mb-1 flex items-center justify-between px-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
                  <span>{p.title || `Phase ${pi + 1}`}</span>
                  {p.complete && <Check className="h-3.5 w-3.5 text-success" />}
                </p>
              )}
              <ul className="space-y-0.5">
                {p.modules.flatMap((m) => m.lessons).map((l) => {
                  const active = l.id === selectedId
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(l.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                          active ? 'bg-primary-bg text-primary-strong' : 'hover:bg-surface-elevated text-text'
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
        </nav>

        {/* Lesson pane */}
        <article className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          {lesson ? (
            <>
              <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
                Lesson {idx + 1} of {order.length}{lesson.estMinutes ? ` · ${lesson.estMinutes} min` : ''}{lesson.required ? '' : ' · optional'}
              </p>
              <h1 className="mt-1 text-xl font-bold text-text">{lesson.title}</h1>

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

              {lesson.body && (
                <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text">{lesson.body}</div>
              )}

              {/* One clear next action */}
              <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
                {prevId && (
                  <button type="button" onClick={() => setSelectedId(prevId)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-muted hover:text-text">
                    <ChevronLeft className="h-4 w-4" /> Back
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {isDone ? (
                    nextId ? (
                      <button type="button" onClick={() => setSelectedId(nextId)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover">
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
