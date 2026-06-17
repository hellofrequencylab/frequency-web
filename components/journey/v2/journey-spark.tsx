'use client'

import { useRef, useState, useTransition } from 'react'
import { Sparkles, ArrowLeft, Loader2, Upload } from 'lucide-react'
import { WizardProgress, wizardPrimaryClass, wizardSecondaryClass } from '@/components/templates'
import { isError } from '@/lib/action-result'
import { sparkJourneyAction, createJourneyFromSparkAction, extractOverviewAction } from '@/app/(main)/journeys/create-actions'
import type { JourneyPace, ArcWeek } from '@/lib/ai/journey-spark'
import { JourneyBuilder } from './journey-builder'

// The guided Journey builder, Step 1 "Spark" (ADR-302). Two ways in:
//   • QUESTIONS — a short stepped form (who / about / outcome / shape), or
//   • OVERVIEW  — paste or upload your own write-up (PDF / Word / text) and let Vera rebuild it.
// Either way Vera drafts the identity + weekly arc for review, then committing creates the Journey
// (+ one Phase per week, opening week's practices) and drops into the editor. Nothing persists until
// that commit. "Build it myself" hands off to the manual draft editor.

const FIELD =
  'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-primary placeholder:text-subtle'

const WEEK_CHOICES = [2, 4, 6, 8] as const

export function JourneySpark() {
  const [mode, setMode] = useState<'wizard' | 'manual'>('wizard')
  const [usingOverview, setUsingOverview] = useState(false)
  const [step, setStep] = useState(1)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [who, setWho] = useState('')
  const [topic, setTopic] = useState('')
  const [outcome, setOutcome] = useState('')
  const [weeks, setWeeks] = useState(4)
  const [pace, setPace] = useState<JourneyPace>('light')
  const [sourceText, setSourceText] = useState('') // the pasted / uploaded overview
  const [extracting, setExtracting] = useState(false)

  // Vera's drafted identity (review step, editable).
  const [title, setTitle] = useState('')
  const [promise, setPromise] = useState('')
  const [overview, setOverview] = useState('')
  const [arc, setArc] = useState<ArcWeek[]>([])

  if (mode === 'manual') return <JourneyBuilder draft />

  const onReview = step === 5
  const total = usingOverview ? 2 : 5
  const current = onReview ? total : usingOverview ? 1 : step
  const label = onReview ? 'Review' : usingOverview ? 'Your overview' : ['Who', 'About', 'Outcome', 'Shape'][step - 1]

  const generate = () => {
    setError(null)
    start(async () => {
      const res = await sparkJourneyAction({ who, topic, outcome, weeks, pace }, usingOverview ? sourceText : undefined)
      if (isError(res)) {
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
    start(() =>
      createJourneyFromSparkAction({
        title,
        promise,
        overview,
        answers: { who, topic, outcome, weeks, pace },
        arc,
        sourceText: usingOverview ? sourceText : undefined,
      }),
    )
  }

  const onFile = (file: File) => {
    setError(null)
    setExtracting(true)
    const fd = new FormData()
    fd.append('file', file)
    start(async () => {
      const res = await extractOverviewAction(fd)
      if (isError(res)) setError(res.error)
      else setSourceText((prev) => (prev.trim() ? `${prev}\n\n${res.data.text}` : res.data.text))
      setExtracting(false)
    })
  }

  const next = () => {
    if (usingOverview || step === 4) generate()
    else setStep((s) => Math.min(5, s + 1))
  }
  const back = () => setStep((s) => Math.max(1, s - 1))

  const canNext = usingOverview
    ? sourceText.trim().length > 0
    : (step === 1 && who.trim().length > 0) ||
      (step === 2 && topic.trim().length > 0) ||
      (step === 3 && outcome.trim().length > 0) ||
      step === 4

  const heading = onReview
    ? { title: 'Here is your Journey', description: "Vera's draft. Edit anything, then create it." }
    : usingOverview
      ? { title: 'Paste or upload your overview', description: 'Drop in your own write-up (PDF, Word, or text) and Vera rebuilds it as a balanced Journey.' }
      : [
          { title: 'Who is this Journey for?', description: 'A sentence is plenty. It shapes everything Vera drafts.' },
          { title: 'What is it about?', description: 'A topic, or just general wellbeing. Either works.' },
          { title: 'What should people walk away with?', description: 'The outcome, in plain words. Lead with the feeling.' },
          { title: 'How long, and how much a day?', description: 'One Phase per week. Keep the daily ask honest.' },
        ][step - 1]

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <WizardProgress current={current} total={total} label={label} />

      <div className="mt-7">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary-strong">New Journey</p>
        <h1 className="text-2xl font-bold text-text">{heading.title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">{heading.description}</p>

        <div className="mt-5">
          {/* OVERVIEW path */}
          {usingOverview && !onReview && (
            <div className="space-y-3">
              <textarea
                autoFocus
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={8}
                className={FIELD}
                placeholder="Paste your course overview, outline, or notes here…"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={extracting || pending}
                  className={`${wizardSecondaryClass} !px-3 !py-2 text-sm`}
                >
                  {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload a file
                </button>
                <span className="text-xs text-subtle">PDF, Word, or plain text</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.pdf,.docx,.doc,application/pdf,text/plain"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">Weeks</span>
                {WEEK_CHOICES.map((w) => (
                  <button key={w} type="button" onClick={() => setWeeks(w)} aria-pressed={weeks === w}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${weeks === w ? 'border-primary/50 bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:text-text'}`}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* QUESTIONS path */}
          {!usingOverview && step === 1 && (
            <textarea autoFocus value={who} onChange={(e) => setWho(e.target.value)} rows={3} className={FIELD} placeholder="e.g. People who feel wired and tired and want their evenings back." />
          )}
          {!usingOverview && step === 2 && (
            <textarea autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} className={FIELD} placeholder="e.g. Sleep and screen habits. Or: general wellbeing." />
          )}
          {!usingOverview && step === 3 && (
            <textarea autoFocus value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={3} className={FIELD} placeholder="e.g. Fall asleep easier and wake up clearer, most days." />
          )}
          {!usingOverview && step === 4 && (
            <div className="space-y-5">
              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Weeks</p>
                <div className="flex flex-wrap items-center gap-2">
                  {WEEK_CHOICES.map((w) => (
                    <button key={w} type="button" onClick={() => setWeeks(w)} aria-pressed={weeks === w}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${weeks === w ? 'border-primary/50 bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:text-text'}`}>
                      {w} weeks
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Time a day</p>
                <div className="grid grid-cols-2 gap-2">
                  {([['light', 'Light', 'A few minutes'], ['medium', 'Medium', 'Ten to twenty minutes']] as const).map(([key, lbl, hint]) => (
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
                      <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Your {arc.length} {arc.length === 1 ? 'week' : 'weeks'}</span>
                      <ol className="space-y-1.5">
                        {arc.map((w, i) => (
                          <li key={i} className="rounded-lg border border-border bg-surface px-3 py-2">
                            <span className="block text-sm font-medium text-text">Week {i + 1}: {w.title}</span>
                            {w.focus && <span className="block text-xs leading-snug text-muted">{w.focus}</span>}
                          </li>
                        ))}
                      </ol>
                      <p className="mt-1.5 text-2xs text-subtle">Vera lays these out as weekly Phases. Edit them in the next step.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-warning">{error}</p>}

        <div className="mt-7 flex gap-3">
          {(step > 1 || (usingOverview && !onReview)) && (
            <button type="button" onClick={usingOverview && !onReview ? () => setUsingOverview(false) : back} disabled={pending} className={`${wizardSecondaryClass} flex-1`}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          {!onReview ? (
            <button type="button" onClick={next} disabled={!canNext || pending} className={`${wizardPrimaryClass} ${step > 1 || usingOverview ? 'flex-1' : 'w-full'}`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : usingOverview || step === 4 ? <Sparkles className="h-4 w-4" /> : null}
              {usingOverview || step === 4 ? 'Draft with Vera' : 'Continue'}
            </button>
          ) : (
            <button type="button" onClick={create} disabled={!title.trim() || pending} className={`${wizardPrimaryClass} flex-1`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create Journey
            </button>
          )}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-subtle">
        {!onReview && !usingOverview && (
          <button type="button" onClick={() => { setUsingOverview(true); setStep(1) }} className="underline-offset-4 transition-colors hover:text-muted hover:underline">
            Have an overview already? Paste or upload it
          </button>
        )}
        {!onReview && (
          <>
            {!usingOverview && <span className="px-1.5 text-border" aria-hidden>·</span>}
            <button type="button" onClick={() => setMode('manual')} className="underline-offset-4 transition-colors hover:text-muted hover:underline">
              Skip — I&apos;ll build it myself
            </button>
          </>
        )}
      </p>
    </div>
  )
}
