'use client'

// Journeys — the guided creation wizard, phases 3 to 5 (ADR-839). Spark and Review ran on
// /journeys/new before the row existed; this surface walks the created draft through
// Shape (structure), Schedule (window + drip), and Ready (ready-check + publish).
//
// THE TOGGLE CONTRACT: every phase offers "Do it in the editor instead", and the editor
// offers "Return to the guide". Both surfaces write to the SAME rows (the plan + its
// items), so switching sides never forks state — the wizard entry in page_config tracks
// only progress and choices. Publishing goes through the one setJourneyVisibility
// chokepoint; this component never re-implements the caps.

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarRange,
  Check,
  ChevronDown,
  Circle,
  Compass,
  Layers,
  Loader2,
  PenLine,
  Plus,
  Send,
} from 'lucide-react'
import { WizardProgress, wizardPrimaryClass, wizardSecondaryClass } from '@/components/templates'
import { isError } from '@/lib/action-result'
import { setJourneyVisibility } from '@/app/(main)/journeys/actions'
import { addPhaseAction } from '@/app/(main)/journeys/[slug]/edit/actions'
import {
  saveGuideProgressAction,
  applyGuideTemplateAction,
  saveGuideScheduleAction,
} from '@/app/(main)/journeys/[slug]/guide/actions'
import {
  GUIDE_PHASES,
  dripPreview,
  windowPreview,
  readyCheck,
  readyToPublish,
  whoCanSee,
  type GuidePhase,
} from '@/lib/journeys/wizard'
import type { PlanVisibility } from '@/lib/journey-plans'
import type { JourneyTemplateMeta } from './journey-spark'

/** One phase of the block tree, flattened for display (module children fold into steps). */
export interface GuidePhaseNode {
  id: string
  title: string
  steps: { id: string; title: string; type: string }[]
}

/** The plan fields the guide reads. The row stays the source of truth; this is a snapshot
 *  the server page refreshes after every save. */
export interface GuidePlan {
  planId: string
  slug: string
  title: string
  summary: string | null
  intro: string | null
  coverImage: string | null
  visibility: PlanVisibility
  dripIntervalDays: number
  windowStartsAt: string | null
  windowEndsAt: string | null
}

/** The role/tier flags the guide consults (lane J1's resolver contract). */
export interface GuideAccess {
  canPublish: boolean
  canRunCohorts: boolean
  dripAllowed: boolean
  publishCap: number | null
}

const FIELD =
  'rounded-card border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-primary placeholder:text-subtle'

const STEP_TYPE_LABELS: Record<string, string> = {
  practice: 'Practice',
  lesson: 'Lesson',
  video: 'Video',
  reading: 'Reading',
  exercise: 'Exercise',
  reflection: 'Reflection',
  check: 'Check-in',
  resource: 'Resource',
}

const DRIP_CHOICES = [
  [1, 'Daily'],
  [3, 'Every 3 days'],
  [7, 'Weekly'],
  [14, 'Every 2 weeks'],
] as const

/** The guide covers steps 3..5 of the five-phase creation flow (Spark and Review are behind). */
const PHASE_META: Record<GuidePhase, { step: number; label: string; title: string; description: string }> = {
  shape: {
    step: 3,
    label: 'Shape',
    title: 'Shape the Journey',
    description: 'The phases people move through, and the steps inside each one.',
  },
  schedule: {
    step: 4,
    label: 'Schedule',
    title: 'Set the pace',
    description: 'When it runs, and how fast the phases unlock.',
  },
  ready: {
    step: 5,
    label: 'Ready',
    title: 'Ready to go live?',
    description: 'What is set, what is missing, and who will see it.',
  },
}

export function JourneyGuide({
  plan,
  phases,
  templates,
  access,
  initialPhase,
}: {
  plan: GuidePlan
  phases: GuidePhaseNode[]
  templates: JourneyTemplateMeta[]
  access: GuideAccess
  initialPhase: GuidePhase
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<GuidePhase>(initialPhase)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const stepCount = useMemo(() => phases.reduce((n, p) => n + p.steps.length, 0), [phases])

  // ── Schedule fields (seeded from the row; saved on Continue) ──
  const [windowStart, setWindowStart] = useState(plan.windowStartsAt?.slice(0, 10) ?? '')
  const [windowEnd, setWindowEnd] = useState(plan.windowEndsAt?.slice(0, 10) ?? '')
  const [drip, setDrip] = useState(plan.dripIntervalDays)
  const windowInvalid = !!windowStart && !!windowEnd && windowEnd < windowStart

  // ── Ready fields ──
  const [target, setTarget] = useState<'unlisted' | 'public'>('public')
  const checks = readyCheck({
    title: plan.title,
    summary: plan.summary,
    intro: plan.intro,
    coverImage: plan.coverImage,
    phaseCount: phases.length,
    stepCount,
    dripIntervalDays: drip,
    windowStartsAt: windowStart || null,
    windowEndsAt: windowEnd || null,
  })
  const ready = readyToPublish(checks)
  const live = plan.visibility !== 'private'

  const go = (next: GuidePhase) => {
    setError(null)
    setPhase(next)
  }

  const continueShape = () => {
    setError(null)
    start(async () => {
      const res = await saveGuideProgressAction(plan.planId, plan.slug, 'shape')
      if (isError(res)) setError(res.error)
      else setPhase('schedule')
    })
  }

  const continueSchedule = () => {
    if (windowInvalid) return
    setError(null)
    start(async () => {
      const res = await saveGuideScheduleAction(plan.planId, plan.slug, {
        startsAt: windowStart || null,
        endsAt: windowEnd || null,
        dripIntervalDays: drip,
      })
      if (isError(res)) setError(res.error)
      else {
        setPhase('ready')
        router.refresh()
      }
    })
  }

  const applyTemplate = (templateId: string) => {
    setError(null)
    start(async () => {
      const res = await applyGuideTemplateAction(plan.planId, plan.slug, templateId)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  const addPhase = () => {
    setError(null)
    start(async () => {
      const res = await addPhaseAction(plan.slug)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  // Publish through the one chokepoint. The server gate owns the caps; a blocked publish
  // comes back as the gate's own upsell message and we show it with a See plans link.
  const publish = () => {
    setError(null)
    start(async () => {
      const res = await setJourneyVisibility(plan.planId, target)
      if (isError(res)) {
        setError(res.error)
        return
      }
      await saveGuideProgressAction(plan.planId, plan.slug, 'ready')
      // The chokepoint hands back where to go next: the launch builder on a publish (ADR-840),
      // the player otherwise. Finishing the guide and finishing the builder land the same place.
      router.push(res.data.next ?? `/journeys/${plan.slug}/learn`)
    })
  }

  const meta = PHASE_META[phase]
  const editorHref = `/journeys/${plan.slug}/edit`

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <WizardProgress current={meta.step} total={5} label={meta.label} />

      <div className="mt-7">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary-strong">
          New Journey · {plan.title}
        </p>
        <h1 className="text-2xl font-bold text-text">{meta.title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">{meta.description}</p>

        <div className="mt-6">
          {/* ── Phase 3 · SHAPE ─────────────────────────────────────────────── */}
          {phase === 'shape' &&
            (phases.length === 0 ? (
              <div className="space-y-2.5">
                <p className="text-sm text-muted">Start from a proven structure, or lay the phases yourself.</p>
                <button
                  type="button"
                  onClick={() => applyTemplate('master-framework')}
                  disabled={pending}
                  className="flex w-full items-start gap-3 rounded-xl border border-primary/40 bg-primary-bg/30 px-4 py-3 text-left transition-colors hover:bg-primary-bg/50 disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary-strong" />
                  ) : (
                    <Compass className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
                      Recommended framework
                      <span className="rounded-pill bg-primary-bg px-1.5 py-0.5 text-2xs font-semibold text-primary-strong">Best start</span>
                    </span>
                    <span className="block text-xs leading-snug text-muted">
                      A welcome, weekly practices across the Pillars, an Expression Challenge each week, and a capstone.
                    </span>
                  </span>
                </button>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t.id)}
                    disabled={pending}
                    className="flex w-full items-start gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-elevated disabled:opacity-60"
                  >
                    <span className="text-2xl leading-none" aria-hidden>{t.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text">{t.name}</span>
                      <span className="block text-xs leading-snug text-muted">{t.description}</span>
                      <span className="mt-1 block text-2xs font-medium uppercase tracking-wide text-muted">
                        {t.phases} {t.phases === 1 ? 'phase' : 'phases'} · {t.lessons} {t.lessons === 1 ? 'lesson' : 'lessons'}
                      </span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={addPhase}
                  disabled={pending}
                  className="flex w-full items-start gap-3 rounded-card border border-dashed border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-surface-elevated disabled:opacity-60"
                >
                  <PenLine className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">Lay it out yourself</span>
                    <span className="block text-xs leading-snug text-muted">Start with one empty phase and build from there.</span>
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {phases.map((p, i) => (
                  <details key={p.id} className="group rounded-card border border-border bg-surface" open={i === 0}>
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                      <Layers className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-text">{p.title || `Phase ${i + 1}`}</span>
                        <span className="block text-2xs text-muted">
                          {p.steps.length} {p.steps.length === 1 ? 'step' : 'steps'}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <div className="border-t border-border px-4 py-2.5">
                      {p.steps.length === 0 ? (
                        <p className="py-1 text-xs text-subtle">Empty so far. Fill it in the editor, or let Vera compose it there.</p>
                      ) : (
                        <ol className="space-y-1.5">
                          {p.steps.map((s) => (
                            <li key={s.id} className="flex items-center gap-2 text-sm text-text">
                              <span className="rounded-pill bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
                                {STEP_TYPE_LABELS[s.type] ?? 'Step'}
                              </span>
                              <span className="min-w-0 truncate">{s.title || 'Untitled step'}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </details>
                ))}
                <button
                  type="button"
                  onClick={addPhase}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/40 hover:text-text disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" /> Add a phase
                </button>
                <p className="text-2xs text-muted">
                  Renaming phases, writing lessons, and picking practices happen in the editor. The guide keeps the big picture.
                </p>
              </div>
            ))}

          {/* ── Phase 4 · SCHEDULE ──────────────────────────────────────────── */}
          {phase === 'schedule' && (
            <div className="space-y-5">
              <div>
                <p className="mb-1.5 inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">
                  <CalendarRange className="h-3.5 w-3.5" /> Run window
                </p>
                <p className="mb-2 text-xs text-muted">Run it between dates, or leave both empty to keep it open anytime.</p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Opens</span>
                    <input
                      type="date"
                      value={windowStart}
                      max={windowEnd || undefined}
                      onChange={(e) => setWindowStart(e.target.value)}
                      className={FIELD}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Closes</span>
                    <input
                      type="date"
                      value={windowEnd}
                      min={windowStart || undefined}
                      onChange={(e) => setWindowEnd(e.target.value)}
                      aria-invalid={windowInvalid}
                      className={`${FIELD} ${windowInvalid ? '!border-danger' : ''}`}
                    />
                  </label>
                </div>
                {windowInvalid ? (
                  <p className="mt-1.5 text-xs text-danger">The close date needs to be on or after the open date.</p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted">{windowPreview(windowStart || null, windowEnd || null)}</p>
                )}
              </div>

              {access.dripAllowed ? (
                <div>
                  <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">Phase drip</p>
                  <p className="mb-2 text-xs text-muted">How fast the phases unlock once someone starts.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {DRIP_CHOICES.map(([days, label]) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setDrip(days)}
                        aria-pressed={drip === days}
                        className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
                          drip === days
                            ? 'border-primary/50 bg-primary-bg text-primary-strong'
                            : 'border-border bg-surface text-muted hover:text-text'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    <label className="inline-flex items-center gap-1.5 text-xs text-muted">
                      or every
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={drip}
                        onChange={(e) => setDrip(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                        className={`${FIELD} w-16 !px-2 !py-1.5`}
                      />
                      days
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-muted">{dripPreview(drip, phases.length)}</p>
                </div>
              ) : (
                <p className="rounded-card border border-border bg-canvas px-3 py-2.5 text-xs text-muted">
                  Phase drip comes with paid plans. For now every phase opens right away.{' '}
                  <Link href="/upgrade" className="font-medium text-primary-strong underline-offset-4 hover:underline">
                    See plans
                  </Link>
                </p>
              )}

              {access.canRunCohorts ? (
                <p className="text-2xs text-muted">
                  Once published, you can open cohort Runs from the Journey page so a group moves through it together.
                </p>
              ) : (
                <p className="rounded-card border border-border bg-canvas px-3 py-2.5 text-xs text-muted">
                  Cohort Runs, where a group starts together on a date, come with paid plans.{' '}
                  <Link href="/upgrade" className="font-medium text-primary-strong underline-offset-4 hover:underline">
                    See plans
                  </Link>
                </p>
              )}
            </div>
          )}

          {/* ── Phase 5 · READY ─────────────────────────────────────────────── */}
          {phase === 'ready' && (
            <div className="space-y-5">
              <ul className="space-y-1.5">
                {checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2.5 rounded-card border border-border bg-surface px-3.5 py-2.5">
                    {c.ok ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
                        {c.label}
                        {!c.ok && !c.required && (
                          <span className="rounded-pill bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">Optional</span>
                        )}
                      </span>
                      <span className="block text-xs leading-snug text-muted">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">Who can see it</p>
                {live ? (
                  <p className="text-sm text-muted">{whoCanSee(plan.visibility)}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">{whoCanSee('private')} Publishing changes that:</p>
                    {(
                      [
                        ['public', 'List it in the library', whoCanSee('public')],
                        ['unlisted', 'Share by link only', whoCanSee('unlisted')],
                      ] as const
                    ).map(([value, label, hint]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTarget(value)}
                        aria-pressed={target === value}
                        className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                          target === value ? 'border-primary/50 bg-primary-bg/30' : 'border-border bg-surface hover:bg-surface-elevated'
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-text">{label}</span>
                          <span className="block text-xs leading-snug text-muted">{hint}</span>
                        </span>
                        {target === value && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />}
                      </button>
                    ))}
                    {access.publishCap !== null && (
                      <p className="text-2xs text-muted">
                        Your plan includes {access.publishCap} published {access.publishCap === 1 ? 'Journey' : 'Journeys'}.{' '}
                        <Link href="/upgrade" className="underline-offset-4 hover:underline">See plans</Link>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {!ready && (
                <p className="text-xs text-warning">Finish the required items above, then publish.</p>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-4 text-sm text-danger">
            {error}{' '}
            <Link href="/upgrade" className="font-medium text-primary-strong underline-offset-4 hover:underline">
              See plans
            </Link>
          </p>
        )}

        {/* Footer — Back / Continue, plus the publish action on Ready. */}
        <div className="mt-7 flex gap-3">
          {phase !== 'shape' && (
            <button
              type="button"
              onClick={() => go(GUIDE_PHASES[GUIDE_PHASES.indexOf(phase) - 1])}
              disabled={pending}
              className={`${wizardSecondaryClass} flex-1`}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          {phase === 'shape' && (
            <button type="button" onClick={continueShape} disabled={pending || phases.length === 0} className={`${wizardPrimaryClass} w-full`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue
            </button>
          )}
          {phase === 'schedule' && (
            <button type="button" onClick={continueSchedule} disabled={pending || windowInvalid} className={`${wizardPrimaryClass} flex-1`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue
            </button>
          )}
          {phase === 'ready' &&
            (live ? (
              <Link href={`/journeys/${plan.slug}/learn`} className={`${wizardPrimaryClass} flex-1`}>
                <Check className="h-4 w-4" /> Published. View it
              </Link>
            ) : (
              <button
                type="button"
                onClick={publish}
                disabled={pending || !ready || !access.canPublish}
                className={`${wizardPrimaryClass} flex-1`}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {pending ? 'Publishing…' : 'Publish'}
              </button>
            ))}
        </div>

        {/* The guided-to-editor toggle: always one tap away, per phase. */}
        <p className="mt-8 text-center text-xs text-subtle">
          <Link href={editorHref} className="underline-offset-4 transition-colors hover:text-muted hover:underline">
            Do it in the editor instead
          </Link>
          <span className="px-1.5 text-border" aria-hidden>·</span>
          <Link href="/journeys/mine" className="underline-offset-4 transition-colors hover:text-muted hover:underline">
            Finish later
          </Link>
        </p>
      </div>
    </div>
  )
}
