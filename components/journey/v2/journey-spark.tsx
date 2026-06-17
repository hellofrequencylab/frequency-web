'use client'

import { useState, useTransition } from 'react'
import { Sparkles, ArrowLeft, Loader2 } from 'lucide-react'
import { WizardProgress, wizardPrimaryClass, wizardSecondaryClass } from '@/components/templates'
import { isError } from '@/lib/action-result'
import { sparkJourneyAction, createJourneyFromSparkAction } from '@/app/(main)/journeys/create-actions'
import type { JourneyPace, ArcWeek } from '@/lib/ai/journey-spark'
import { JourneyBuilder } from './journey-builder'

// The guided Journey builder, Step 1 "Spark" (ADR-302). A short stepped form (one question per
// screen, a progress bar, a skip-to-manual escape) that ends with Vera's drafted identity for the
// author to review/edit. Committing creates the Journey + one weekly Phase per week and drops them
// into the editor, where Vera fills the practices. Nothing persists until that commit (no untitled
// drafts). "Build it myself" hands off to the manual draft editor.

const FIELD =
  'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-primary placeholder:text-subtle'

const WEEK_CHOICES = [2, 4, 6, 8] as const

export function JourneySpark() {
  const [mode, setMode] = useState<'wizard' | 'manual'>('wizard')
  const [step, setStep] = useState(1)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [who, setWho] = useState('')
  const [topic, setTopic] = useState('')
  const [outcome, setOutcome] = useState('')
  const [weeks, setWeeks] = useState(4)
  const [pace, setPace] = useState<JourneyPace>('light')

  // The reviewed identity (seeded by Vera on step 4 → 5, editable on step 5).
  const [title, setTitle] = useState('')
  const [promise, setPromise] = useState('')
  const [overview, setOverview] = useState('')
  const [arc, setArc] = useState<ArcWeek[]>([])

  if (mode === 'manual') return <JourneyBuilder draft />

  const TOTAL = 5
  const STEP_LABELS = ['Who', 'About', 'Outcome', 'Shape', 'Review']

  const generate = () => {
    setError(null)
    start(async () => {
      const res = await sparkJourneyAction({ who, topic, outcome, weeks, pace })
      if (isError(res)) {
        // Vera offline — let them name it by hand on the review step.
        setError(res.error)
      } else {
        setTitle(res.data.title)
        setPromise(res.data.promise)
        setOverview(res.data.overview)
        setArc(res.data.arc ?? [])
      }
      setStep(5)
    })
  }

  const create = () => {
    if (!title.trim()) return
    setError(null)
    start(() => createJourneyFromSparkAction({ title, promise, overview, answers: { who, topic, outcome, weeks, pace }, arc }))
  }

  const next = () => {
    if (step === 4) generate()
    else setStep((s) => Math.min(TOTAL, s + 1))
  }
  const back = () => setStep((s) => Math.max(1, s - 1))

  const canNext =
    (step === 1 && who.trim().length > 0) ||
    (step === 2 && topic.trim().length > 0) ||
    (step === 3 && outcome.trim().length > 0) ||
    step === 4

  const COPY: Record<number, { eyebrow: string; title: string; description: string }> = {
    1: { eyebrow: 'New Journey', title: 'Who is this Journey for?', description: 'A sentence is plenty. It shapes everything Vera drafts.' },
    2: { eyebrow: 'New Journey', title: 'What is it about?', description: 'A topic, or just general wellbeing. Either works.' },
    3: { eyebrow: 'New Journey', title: 'What should people walk away with?', description: 'The outcome, in plain words. Lead with the feeling.' },
    4: { eyebrow: 'New Journey', title: 'How long, and how much a day?', description: 'One Phase per week. Keep the daily ask honest.' },
    5: { eyebrow: 'New Journey', title: 'Here is your Journey', description: "Vera's draft. Edit anything, then create it." },
  }
  const copy = COPY[step]

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <WizardProgress current={step} total={TOTAL} label={STEP_LABELS[step - 1]} />

      <div className="mt-7">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary-strong">{copy.eyebrow}</p>
        <h1 className="text-2xl font-bold text-text">{copy.title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">{copy.description}</p>

        <div className="mt-5">
          {step === 1 && (
            <textarea autoFocus value={who} onChange={(e) => setWho(e.target.value)} rows={3} className={FIELD} placeholder="e.g. People who feel wired and tired and want their evenings back." />
          )}
          {step === 2 && (
            <textarea autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} className={FIELD} placeholder="e.g. Sleep and screen habits. Or: general wellbeing." />
          )}
          {step === 3 && (
            <textarea autoFocus value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={3} className={FIELD} placeholder="e.g. Fall asleep easier and wake up clearer, most days." />
          )}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Weeks</p>
                <div className="flex flex-wrap items-center gap-2">
                  {WEEK_CHOICES.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWeeks(w)}
                      aria-pressed={weeks === w}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${weeks === w ? 'border-primary/50 bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:text-text'}`}
                    >
                      {w} weeks
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Time a day</p>
                <div className="grid grid-cols-2 gap-2">
                  {([['light', 'Light', 'A few minutes'], ['medium', 'Medium', 'Ten to twenty minutes']] as const).map(([key, label, hint]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPace(key)}
                      aria-pressed={pace === key}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${pace === key ? 'border-primary/50 bg-primary-bg' : 'border-border bg-surface hover:bg-surface-elevated'}`}
                    >
                      <span className="block text-sm font-semibold text-text">{label}</span>
                      <span className="block text-xs text-muted">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-3">
              {pending && !title ? (
                <p className="flex items-center gap-2 rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-muted">
                  <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-primary-strong" aria-hidden /> Vera is drafting your Journey…
                </p>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Title</span>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${FIELD} font-semibold`} placeholder="Name your Journey" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">One-line promise</span>
                    <input value={promise} onChange={(e) => setPromise(e.target.value)} className={FIELD} placeholder="What they'll walk away with" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Overview</span>
                    <textarea value={overview} onChange={(e) => setOverview(e.target.value)} rows={4} className={FIELD} placeholder="What this is and who it's for." />
                  </label>
                  {arc.length > 0 && (
                    <div>
                      <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">
                        Your {arc.length} {arc.length === 1 ? 'week' : 'weeks'}
                      </span>
                      <ol className="space-y-1.5">
                        {arc.map((w, i) => (
                          <li key={i} className="rounded-lg border border-border bg-surface px-3 py-2">
                            <span className="block text-sm font-medium text-text">Week {i + 1}: {w.title}</span>
                            {w.focus && <span className="block text-xs leading-snug text-muted">{w.focus}</span>}
                          </li>
                        ))}
                      </ol>
                      <p className="mt-1.5 text-2xs text-subtle">Vera will lay these out as weekly Phases. Edit them in the next step.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-warning">{error}</p>}

        <div className="mt-7 flex gap-3">
          {step > 1 && (
            <button type="button" onClick={back} disabled={pending} className={`${wizardSecondaryClass} flex-1`}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          {step < 5 ? (
            <button type="button" onClick={next} disabled={!canNext || pending} className={`${wizardPrimaryClass} ${step > 1 ? 'flex-1' : 'w-full'}`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : step === 4 ? <Sparkles className="h-4 w-4" /> : null}
              {step === 4 ? 'Draft with Vera' : 'Continue'}
            </button>
          ) : (
            <button type="button" onClick={create} disabled={!title.trim() || pending} className={`${wizardPrimaryClass} flex-1`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create Journey
            </button>
          )}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-subtle">
        <button type="button" onClick={() => setMode('manual')} className="underline-offset-4 transition-colors hover:text-muted hover:underline">
          Skip — I&apos;ll build it myself
        </button>
      </p>
    </div>
  )
}
