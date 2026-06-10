'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, X, Wand2, ArrowLeft, Zap } from 'lucide-react'
import { suggestPracticeAction, claimPracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'

// Claim a starter TEMPLATE → your own practice, via a short Vera-guided wizard
// (ADR-116). Mirrors the demo-circle claim (components/circles/claim-circle.tsx):
// a prominent button opens a modal — (1) your goal + schedule, (2) Vera tailors
// the title / cadence / steps (editable; falls back to the template if AI is off),
// (3) Claim → creates your private, adopted copy and drops you on it.

type Fallback = { title: string; cadence: string; why: string; steps: string[] }

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-subtle'

export function ClaimPractice({ templateId, fallback }: { templateId: string; fallback: Fallback }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [pending, start] = useTransition()
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [veraUsed, setVeraUsed] = useState(false)

  // Step 1
  const [goal, setGoal] = useState('')
  const [schedule, setSchedule] = useState('')

  // Step 2 (the editable, personalized practice)
  const [title, setTitle] = useState(fallback.title)
  const [cadence, setCadence] = useState(fallback.cadence)
  const [why, setWhy] = useState(fallback.why)
  const [steps, setSteps] = useState(fallback.steps.join('\n'))

  function reset() {
    setStep(1)
    setError(null)
    setVeraUsed(false)
    setGoal('')
    setSchedule('')
    setTitle(fallback.title)
    setCadence(fallback.cadence)
    setWhy(fallback.why)
    setSteps(fallback.steps.join('\n'))
  }

  function close() {
    setOpen(false)
    reset()
  }

  function prefillFromFallback() {
    setTitle(fallback.title)
    setCadence(fallback.cadence)
    setWhy(fallback.why)
    setSteps(fallback.steps.join('\n'))
  }

  async function askVera() {
    setError(null)
    setThinking(true)
    try {
      const r = await suggestPracticeAction(templateId, goal, schedule)
      if (!isError(r) && r.data.suggestion) {
        const s = r.data.suggestion
        setTitle(s.title)
        setCadence(s.cadence)
        setWhy(s.why)
        setSteps(s.steps.join('\n'))
        setVeraUsed(true)
      } else {
        prefillFromFallback()
      }
    } catch {
      prefillFromFallback()
    } finally {
      setThinking(false)
      setStep(2)
    }
  }

  function claim() {
    setError(null)
    const stepLines = steps.split('\n').map((s) => s.trim()).filter(Boolean)
    const body = `${why.trim()}\n\n**How I'll do it**\n${stepLines.map((s) => `- ${s}`).join('\n')}`
    start(async () => {
      const r = await claimPracticeAction(templateId, {
        title,
        summary: why.trim().slice(0, 140) || null,
        cadence,
        body,
      })
      if (isError(r)) {
        setError(r.error)
        return
      }
      close()
      router.push(`/practices/${r.data.id}`)
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
      >
        <Sparkles className="h-4 w-4" /> Claim &amp; make it yours
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl border border-border bg-surface p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-text">
                <Wand2 className="h-5 w-5 text-primary" />
                {step === 1 ? 'Make it yours' : 'Your practice'}
              </h2>
              <button onClick={close} aria-label="Close" className="rounded-lg p-1 text-subtle hover:bg-surface-elevated">
                <X className="h-5 w-5" />
              </button>
            </div>

            {step === 1 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted">
                  Tell Vera what you’re after and she’ll shape this practice around you, or skip and tweak it yourself.
                </p>
                <div>
                  <label className={LABEL} htmlFor="goal">What do you want from this?</label>
                  <textarea
                    id="goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="e.g. I want to feel calmer in the mornings and stop reaching for my phone first."
                    className={`mt-1 ${FIELD}`}
                  />
                </div>
                <div>
                  <label className={LABEL} htmlFor="schedule">When can you realistically do it?</label>
                  <input
                    id="schedule"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                    maxLength={300}
                    placeholder="e.g. weekday mornings, 10 minutes before work"
                    className={`mt-1 ${FIELD}`}
                  />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    onClick={() => {
                      prefillFromFallback()
                      setStep(2)
                    }}
                    className="text-sm font-medium text-subtle hover:text-text"
                  >
                    Skip, I&apos;ll do it myself
                  </button>
                  <button
                    onClick={askVera}
                    disabled={thinking || !goal.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {thinking ? 'Vera is shaping it…' : 'Ask Vera'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {veraUsed && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-primary-bg px-3 py-2 text-xs font-medium text-primary-strong">
                    <Sparkles className="h-3.5 w-3.5" /> Vera tailored this to you. Edit anything before you claim it.
                  </p>
                )}
                <div>
                  <label className={LABEL} htmlFor="ctitle">Name</label>
                  <input id="ctitle" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={`mt-1 ${FIELD}`} />
                </div>
                <div>
                  <label className={LABEL} htmlFor="ccadence">Cadence</label>
                  <input id="ccadence" value={cadence} onChange={(e) => setCadence(e.target.value)} maxLength={40} className={`mt-1 ${FIELD}`} />
                </div>
                <div>
                  <label className={LABEL} htmlFor="csteps">Your steps (one per line)</label>
                  <textarea id="csteps" value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} className={`mt-1 ${FIELD}`} />
                </div>
                <div>
                  <label className={LABEL} htmlFor="cwhy">Why it matters to you</label>
                  <textarea id="cwhy" value={why} onChange={(e) => setWhy(e.target.value)} rows={2} maxLength={280} className={`mt-1 ${FIELD}`} />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <button onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-subtle hover:text-text">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <button
                    onClick={claim}
                    disabled={pending || !title.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 fill-on-primary" />}
                    {pending ? 'Claiming…' : 'Claim it'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
