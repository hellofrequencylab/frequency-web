'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowLeft, Loader2, Upload } from 'lucide-react'
import { WizardProgress, wizardPrimaryClass, wizardSecondaryClass } from '@/components/templates'
import { isError } from '@/lib/action-result'
import { sparkPracticeAction, createPracticeFromSparkAction } from '@/app/(main)/practices/create-actions'
import { createPracticeDraftAction } from '@/app/(main)/practices/actions'
import type { PracticePace, PracticeCadenceHint } from '@/lib/ai/practice-spark'

// The guided Practice builder, Step 1 "Spark" (ADR-358). Two ways in:
//   • QUESTIONS — a short stepped form (who / the act / outcome / cadence + time), or
//   • WRITTEN   — paste a Practice you already wrote and let Vera shape it into the fields.
// Either way Vera drafts the WHOLE Practice for review, then committing creates the row and
// drops the author into the editor. Nothing persists until that commit (deferred creation).
// "Build it myself" creates a blank draft and opens the editor straight away.

const FIELD =
  'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-primary placeholder:text-subtle'

const CADENCE_CHOICES: { key: PracticeCadenceHint; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'few-times-week', label: 'A few times a week' },
  { key: 'weekly', label: 'Weekly' },
]

export function PracticeSpark() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [usingWritten, setUsingWritten] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [who, setWho] = useState('')
  const [act, setAct] = useState('')
  const [outcome, setOutcome] = useState('')
  const [cadence, setCadence] = useState<PracticeCadenceHint>('daily')
  const [pace, setPace] = useState<PracticePace>('light')
  const [sourceText, setSourceText] = useState('') // the pasted, already-written practice

  // Vera's drafted Practice (review step, editable).
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const [pillars, setPillars] = useState<Array<'mind' | 'body' | 'spirit' | 'expression'>>([])
  const [draftCadence, setDraftCadence] = useState('')
  const [durationMin, setDurationMin] = useState<number | null>(null)

  const onReview = step === 5
  const total = usingWritten ? 2 : 5
  const current = onReview ? total : usingWritten ? 1 : step
  const label = onReview ? 'Review' : usingWritten ? 'Your practice' : ['Who', 'The act', 'Outcome', 'Shape'][step - 1]

  const generate = () => {
    setError(null)
    start(async () => {
      const res = await sparkPracticeAction({ who, act, outcome, cadence, pace }, usingWritten ? sourceText : undefined)
      if (isError(res)) {
        setError(res.error)
      } else {
        setTitle(res.data.title)
        setSummary(res.data.summary)
        setDescription(res.data.description)
        setBody(res.data.body)
        setPillars(res.data.pillar ? [res.data.pillar] : [])
        setDraftCadence(res.data.cadence)
        setDurationMin(res.data.durationMin)
      }
      setStep(5)
    })
  }

  const create = () => {
    if (!title.trim()) return
    setError(null)
    start(() =>
      createPracticeFromSparkAction({
        title,
        summary,
        description,
        body,
        pillars,
        cadence: draftCadence || null,
        durationMin,
      }),
    )
  }

  // Escape hatch: a blank draft, then straight into the full editor (mirrors NewPracticeButton).
  const buildItMyself = () => {
    setError(null)
    start(async () => {
      const r = await createPracticeDraftAction()
      if (isError(r)) setError(r.error)
      else router.push(`/practices/${r.data.id}/edit`)
    })
  }

  const next = () => {
    if (usingWritten || step === 4) generate()
    else setStep((s) => Math.min(5, s + 1))
  }
  const back = () => setStep((s) => Math.max(1, s - 1))

  const canNext = usingWritten
    ? sourceText.trim().length > 0
    : (step === 1 && who.trim().length > 0) ||
      (step === 2 && act.trim().length > 0) ||
      (step === 3 && outcome.trim().length > 0) ||
      step === 4

  const heading = onReview
    ? { title: 'Here is your Practice', description: "Vera's draft. Edit anything, then create it." }
    : usingWritten
      ? { title: 'Paste your written practice', description: 'Drop in what you already wrote and Vera shapes it into a Practice you can review.' }
      : [
          { title: 'Who is this Practice for?', description: 'Tell Vera who it is for in a sentence and she drafts the whole Practice.' },
          { title: 'What do they actually do?', description: 'The act, in plain words. The concrete thing, not a vibe.' },
          { title: 'What do they walk away with?', description: 'The outcome after a week. Lead with the feeling, plainly.' },
          { title: 'How often, and how long?', description: 'Keep the ask honest. The entry version should fit in five minutes.' },
        ][step - 1]

  const PILLARS: { key: 'mind' | 'body' | 'spirit' | 'expression'; label: string }[] = [
    { key: 'mind', label: 'Mind' },
    { key: 'body', label: 'Body' },
    { key: 'spirit', label: 'Spirit' },
    { key: 'expression', label: 'Expression' },
  ]

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <WizardProgress current={current} total={total} label={label} />

      <div className="mt-7">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary-strong">New Practice</p>
        <h1 className="text-2xl font-bold text-text">{heading.title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">{heading.description}</p>

        <div className="mt-5">
          {/* WRITTEN path — paste a Practice you already have and let Vera shape it. */}
          {usingWritten && !onReview && (
            <textarea
              autoFocus
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={9}
              className={FIELD}
              placeholder="Paste your practice here, the steps and how to do it, anything you've already written…"
            />
          )}

          {!usingWritten && step === 1 && (
            <>
              <textarea autoFocus value={who} onChange={(e) => setWho(e.target.value)} rows={3} className={FIELD} placeholder="e.g. People who wake up wired and want a calmer start." />
              {/* Second path: drop in a Practice you already wrote and let Vera shape it. */}
              <button
                type="button"
                onClick={() => { setUsingWritten(true); setStep(1) }}
                className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-bg/20 px-4 py-3 text-left transition-colors hover:bg-primary-bg/40"
              >
                <Upload className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">Already have the practice written?</span>
                  <span className="block text-xs leading-snug text-muted">Paste what you wrote and Vera shapes it into a Practice for you to review.</span>
                </span>
              </button>
            </>
          )}
          {!usingWritten && step === 2 && (
            <textarea autoFocus value={act} onChange={(e) => setAct(e.target.value)} rows={3} className={FIELD} placeholder="e.g. Sit for two minutes and breathe before reaching for the phone." />
          )}
          {!usingWritten && step === 3 && (
            <textarea autoFocus value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={3} className={FIELD} placeholder="e.g. Start the day a notch calmer, most mornings." />
          )}
          {!usingWritten && step === 4 && (
            <div className="space-y-5">
              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">How often</p>
                <div className="flex flex-wrap items-center gap-2">
                  {CADENCE_CHOICES.map((c) => (
                    <button key={c.key} type="button" onClick={() => setCadence(c.key)} aria-pressed={cadence === c.key}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${cadence === c.key ? 'border-primary/50 bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:text-text'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Time a session</p>
                <div className="grid grid-cols-2 gap-2">
                  {([['light', 'Light', 'Five minutes or less'], ['medium', 'Medium', 'Ten to twenty minutes']] as const).map(([key, lbl, hint]) => (
                    <button key={key} type="button" onClick={() => setPace(key)} aria-pressed={pace === key}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${pace === key ? 'border-primary/50 bg-primary-bg' : 'border-border bg-surface hover:bg-surface-elevated'}`}>
                      <span className="block text-sm font-semibold text-text">{lbl}</span>
                      <span className="block text-xs text-muted">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* REVIEW */}
          {onReview && (
            <div className="space-y-3">
              {pending && !title ? (
                <p className="flex items-center gap-2 rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-muted">
                  <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-primary-strong" aria-hidden /> Vera is shaping your Practice…
                </p>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Name</span>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={`${FIELD} font-semibold`} placeholder="Name your Practice" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Card hook</span>
                    <input value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={140} className={FIELD} placeholder="The problem it solves, in a line" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Description</span>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={280} className={FIELD} placeholder="Who it's for and what they notice after a week" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Guide</span>
                    <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={8000} className={FIELD} placeholder="The steps, in plain words" />
                  </label>
                  <div>
                    <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Pillars</span>
                    <div className="flex flex-wrap gap-1.5">
                      {PILLARS.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setPillars((prev) => (prev.includes(p.key) ? prev.filter((x) => x !== p.key) : [...prev, p.key]))}
                          aria-pressed={pillars.includes(p.key)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${pillars.includes(p.key) ? 'border-primary/40 bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:text-text'}`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-2xs text-subtle">Pick one or more Pillars. You can change them, the cadence, and everything else in the next step.</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-warning">{error}</p>}

        <div className="mt-7 flex gap-3">
          {(step > 1 || (usingWritten && !onReview)) && (
            <button type="button" onClick={usingWritten && !onReview ? () => setUsingWritten(false) : back} disabled={pending} className={`${wizardSecondaryClass} flex-1`}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          {!onReview ? (
            <button type="button" onClick={next} disabled={!canNext || pending} className={`${wizardPrimaryClass} ${step > 1 || usingWritten ? 'flex-1' : 'w-full'}`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : usingWritten || step === 4 ? <Sparkles className="h-4 w-4" /> : null}
              {usingWritten || step === 4 ? 'Draft with Vera' : 'Continue'}
            </button>
          ) : (
            <button type="button" onClick={create} disabled={!title.trim() || pending} className={`${wizardPrimaryClass} flex-1`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create Practice
            </button>
          )}
        </div>
      </div>

      {!onReview && (
        <p className="mt-8 text-center text-xs text-subtle">
          {!usingWritten && (
            <>
              <button type="button" onClick={() => { setUsingWritten(true); setStep(1) }} className="underline-offset-4 transition-colors hover:text-muted hover:underline">
                Already have the practice written? Paste it
              </button>
              <span className="px-1.5 text-border" aria-hidden>·</span>
            </>
          )}
          <button type="button" onClick={buildItMyself} disabled={pending} className="underline-offset-4 transition-colors hover:text-muted hover:underline disabled:opacity-60">
            Skip, I&apos;ll build it myself
          </button>
        </p>
      )}
    </div>
  )
}
