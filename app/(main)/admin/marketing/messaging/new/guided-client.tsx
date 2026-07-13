'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Sparkles, PencilRuler, Lightbulb, Megaphone, Activity, Check } from 'lucide-react'
import { WizardProgress } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'
import { cn } from '@/lib/utils'
import { isError } from '@/lib/action-result'
import { MESSAGING_GOALS, MESSAGING_TONES, getMessagingGoal } from '@/lib/messaging/goals'
import { startBuild } from './actions'

// The guided setup, three screens (EMAIL-CAMPAIGNS-FUNNELS-PLAN P3, ask #3/#6): pick a
// GOAL, answer a few plain questions, then choose "Let Vera draft it" or "Build it
// manually", seeded from a best-practice template, never a blank page. Lives inside the
// admin workspace, so it uses the kit's WizardProgress + Button rather than the
// full-screen onboarding WizardShell. No em dashes (voice).

type SegmentOption = { key: string; label: string }

export function GuidedSetup({ segments }: { segments: SegmentOption[] }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [goalKey, setGoalKey] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [audience, setAudience] = useState(segments[0]?.key ?? '')
  const [tone, setTone] = useState(MESSAGING_TONES[0].key)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const goal = goalKey ? getMessagingGoal(goalKey) : null

  function pickGoal(key: string) {
    setGoalKey(key)
    const g = getMessagingGoal(key)
    if (g && !name) setName(g.suggestedName)
    setStep(2)
  }

  function build(mode: 'manual' | 'vera') {
    if (!goal) return
    setError(null)
    start(async () => {
      const res = await startBuild({ goalKey: goal.key, name, audience, tone, mode })
      if (isError(res)) {
        setError(res.error)
        return
      }
      const suffix = res.data.veraPending ? `${res.data.href.includes('?') ? '&' : '?'}vera=pending` : ''
      router.push(`${res.data.href}${suffix}`)
    })
  }

  return (
    <div className="mx-auto max-w-2xl">
      <WizardProgress current={step} total={3} label={STEP_LABELS[step - 1]} />

      <div className="mt-6">
        {step === 1 && <GoalStep onPick={pickGoal} selected={goalKey} />}

        {step === 2 && goal && (
          <QuestionsStep
            goal={goal}
            name={name}
            setName={setName}
            audience={audience}
            setAudience={setAudience}
            tone={tone}
            setTone={setTone}
            segments={segments}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && goal && (
          <BuildStep
            goal={goal}
            name={name}
            pending={pending}
            error={error}
            onBack={() => setStep(2)}
            onBuild={build}
          />
        )}
      </div>
    </div>
  )
}

const STEP_LABELS = ['Goal', 'A few questions', 'How to build']

function GoalStep({ onPick, selected }: { onPick: (key: string) => void; selected: string | null }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-text">What are you trying to do?</h2>
      <p className="mt-0.5 text-sm text-muted">Pick a goal. Each one starts you from a best-practice shape.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {MESSAGING_GOALS.map((g) => {
          const Icon = g.object === 'funnel' ? Activity : Megaphone
          const active = selected === g.key
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => onPick(g.key)}
              className={cn(
                'flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors',
                active ? 'border-primary-strong ring-1 ring-primary-strong' : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              <span className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-subtle">
                  {g.object === 'funnel' ? 'Funnel' : 'Campaign'}
                </span>
              </span>
              <span className="text-sm font-semibold text-text">{g.label}</span>
              <span className="text-xs leading-snug text-muted">{g.blurb}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function QuestionsStep({
  goal,
  name,
  setName,
  audience,
  setAudience,
  tone,
  setTone,
  segments,
  onBack,
  onNext,
}: {
  goal: NonNullable<ReturnType<typeof getMessagingGoal>>
  name: string
  setName: (v: string) => void
  audience: string
  setAudience: (v: string) => void
  tone: string
  setTone: (v: string) => void
  segments: SegmentOption[]
  onBack: () => void
  onNext: () => void
}) {
  const fieldCls =
    'mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text outline-none focus:border-primary'
  return (
    <div>
      <h2 className="text-lg font-bold text-text">{goal.label}</h2>
      <p className="mt-0.5 text-sm text-muted">A few plain questions. You can change all of this later.</p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-text" htmlFor="msg-name">
            Name it
          </label>
          <input
            id="msg-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={goal.suggestedName}
            className={fieldCls}
          />
        </div>

        {goal.object === 'campaign' && (
          <div>
            <label className="block text-xs font-semibold text-text" htmlFor="msg-audience">
              Who is it for?
            </label>
            <select id="msg-audience" value={audience} onChange={(e) => setAudience(e.target.value)} className={fieldCls}>
              {segments.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {goal.object === 'funnel' && goal.triggerHint && (
          <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <p className="text-xs font-semibold text-text">Trigger</p>
            <p className="text-xs text-muted">{goal.triggerHint}. You can wire the exact event in the flow view.</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-text" htmlFor="msg-tone">
            Tone
          </label>
          <select id="msg-tone" value={tone} onChange={(e) => setTone(e.target.value)} className={fieldCls}>
            {MESSAGING_TONES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Best-practice tips ride along (ask #6). */}
        <div className="rounded-xl border border-info/30 bg-info-bg px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-info">
            <Lightbulb className="h-3.5 w-3.5" aria-hidden /> Best practice
          </p>
          <ul className="mt-1 space-y-1">
            {goal.tips.map((t, i) => (
              <li key={i} className="text-xs text-text/80">
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* The best-practice series preview for a funnel goal. */}
        {goal.object === 'funnel' && goal.outline && (
          <div>
            <p className="text-xs font-semibold text-text">The series we will set up</p>
            <ol className="mt-1.5 space-y-1.5">
              {goal.outline.map((s, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-bg text-2xs font-bold text-primary-strong">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-text">{s.title}</span>
                    <span className="block text-2xs text-muted">{s.note}</span>
                  </span>
                  <span className="shrink-0 text-2xs text-subtle">{s.timing}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </Button>
        <Button type="button" onClick={onNext} disabled={!name.trim()} className="flex-1">
          Continue <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

function BuildStep({
  goal,
  name,
  pending,
  error,
  onBack,
  onBuild,
}: {
  goal: NonNullable<ReturnType<typeof getMessagingGoal>>
  name: string
  pending: boolean
  error: string | null
  onBack: () => void
  onBuild: (mode: 'manual' | 'vera') => void
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-text">How do you want to build it?</h2>
      <p className="mt-0.5 text-sm text-muted">
        Both start from the {goal.object === 'funnel' ? 'best-practice series' : 'template'} for {name || goal.suggestedName}.
      </p>

      {error && (
        <div className="mt-4">
          <Banner tone="critical" title="That did not work">
            {error}
          </Banner>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* Let Vera draft it — the deferred seam (P5). Honest label: it sets up the
            scaffold now and notes that Vera drafting is on the way. */}
        <button
          type="button"
          onClick={() => onBuild('vera')}
          disabled={pending}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong disabled:opacity-60"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-text">Let Vera draft it</span>
          <span className="text-xs leading-snug text-muted">
            Vera will write the subjects and copy from your answers. Drafting lands soon. For now this sets up the
            scaffold for you to fill in.
          </span>
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-subtle">
            Coming soon
          </span>
        </button>

        {/* Build it manually — fully wired. */}
        <button
          type="button"
          onClick={() => onBuild('manual')}
          disabled={pending}
          className="flex flex-col gap-2 rounded-2xl border border-primary-strong bg-surface p-4 text-left ring-1 ring-primary-strong transition-colors disabled:opacity-60"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary">
            <PencilRuler className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-text">Build it manually</span>
          <span className="text-xs leading-snug text-muted">
            {goal.object === 'funnel'
              ? 'Open the flow view with the series set up, ready for you to write.'
              : 'Open the composer with the audience preset, ready to write.'}
          </span>
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-2xs font-medium text-success">
            <Check className="h-3 w-3" aria-hidden /> Ready
          </span>
        </button>
      </div>

      <div className="mt-6">
        <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </Button>
      </div>
    </div>
  )
}
