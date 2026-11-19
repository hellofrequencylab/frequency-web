'use client'

// THE FEATURE BUILDER (LIVE-2481): one short builder per feature, the shared island behind /free-spotlight and its
// three siblings. The hero is the builder: a promise with a small clock beside it, one step card at a time on the
// left, the thing being made filling in on the right. The clock is a light challenge (beat 3:00), never a deadline:
// past it, it counts bonus time and says so kindly. The draft lives in the visitor's own browser until they finish,
// so they can leave and come back; a member who is signed in saves straight into the feature, a visitor signs in
// first (lib/feature-builder/actions.ts) and app/finish/[feature] saves it. The finish shows what they made and
// offers the next feature beside "I'm done for now" (NextSteps), so nobody is walked through all four.
//
// Each page hands in its own steps and preview; everything else (the clock, the steps bar, saving, the hand-over and
// the finish) is here, so the four builders behave the same. Styles: feature-studio.css plus the builder's own
// card, field and button classes from create-space.css.
import { GoogleMark } from '@/components/google-mark'
import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { Input, Textarea } from '@/components/ui/field'
import { claimFeatureWithEmail, claimFeatureWithGoogle, finishSignedIn } from '@/lib/feature-builder/actions'
import { feature as featureEntry, type FeatureId } from '@/lib/feature-builder/catalog'
import { DRAFT_FIELDS, cleanDraft, type FeatureDraft } from '@/lib/feature-builder/draft'
import { clockView, readClock, startClock, stopClock, type ClockState } from '@/lib/feature-builder/clock'
import { formatClock } from '@/lib/launch/clock'
import '../create-space/create-space.css'
import './feature-studio.css'

export interface StudioField {
  key: string
  label: string
  placeholder?: string
  hint?: string
  kind?: 'input' | 'textarea' | 'url' | 'email' | 'choice'
  /** For a choice: the options, one tap each. */
  options?: readonly { value: string; label: string; hint?: string }[]
  rows?: number
  /** Tap-to-fill starters shown under the field. */
  examples?: readonly string[]
  autoComplete?: string
}

export interface StudioStep {
  id: string
  /** The steps bar label, one or two words. */
  label: string
  title: ReactNode
  sub?: string
  fields: readonly StudioField[]
}

export interface StudioCopy {
  /** The H1 lead; the clause "in N minutes." follows it in serif. */
  headline: string
  sub: string
  /** The finish button for a member who is signed in. */
  publishLabel: string
  /** What the hand-over says will happen once they are signed in. */
  claimLine: string
}

export interface StudioDone {
  /** The live address of what they made, when it has one. */
  liveHref: string | null
}

interface Props {
  feature: FeatureId
  steps: readonly StudioStep[]
  copy: StudioCopy
  signedIn: boolean
  /** Set when the page opens on a finished build (?done=1 after the hand-over, or a member's own save). */
  done: StudioDone | null
  /** A save the finish route could not make (?e=save) or a draft that did not survive (?e=draft). */
  error: 'save' | 'draft' | null
  preview: (draft: FeatureDraft) => ReactNode
  /** The what's-next card, rendered by the page (server markup) and shown once the build is done. */
  next: ReactNode
  /** Seed values a door already knew (a name from the profile, a kit from a theme page). */
  seed?: Partial<FeatureDraft>
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** The wall clock, read only from handlers and effects. */
const wallClock = () => Date.now()
const draftKey = (f: FeatureId) => `fq-fb-draft-${f}`

function readStored(feature: FeatureId): FeatureDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(feature))
    return raw ? cleanDraft(feature, JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function FeatureStudio({ feature, steps, copy, signedIn, done, error, preview, next, seed }: Props) {
  const entry = featureEntry(feature)
  const budgetMs = entry.minutes * 60_000
  const [draft, setDraft] = useState<FeatureDraft>(() => ({ ...cleanDraft(feature, {}), ...cleanSeed(feature, seed) }))
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<'build' | 'claim' | 'sent' | 'done'>(done ? 'done' : 'build')
  const [clock, setClock] = useState<ClockState>({ startedAt: null, endedAt: null })
  const [now, setNow] = useState(0)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState<string | null>(error === 'save' ? 'We could not save that. Try again.' : error === 'draft' ? 'We lost part of that. Check the steps and try again.' : null)
  const [liveHref, setLiveHref] = useState<string | null>(done?.liveHref ?? null)
  const [pending, start] = useTransition()
  const restored = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Pick up a draft and a clock this browser already has (a visitor who left and came back).
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const stored = readStored(feature)
    const c = readClock(feature)
    // Restoring browser-only state after hydration is the one setState an effect is for here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored && !done) setDraft((d) => ({ ...d, ...Object.fromEntries(Object.entries(stored).filter(([, v]) => v)) }))
    setClock(done ? stopClock(feature) : c)
    setNow(wallClock())
    if (done) { try { window.localStorage.removeItem(draftKey(feature)) } catch { /* nothing kept */ } }
  }, [feature, done])

  // The clock ticks only while it runs.
  useEffect(() => {
    if (!clock.startedAt || clock.endedAt) return
    const t = window.setInterval(() => setNow(wallClock()), 500)
    return () => window.clearInterval(t)
  }, [clock.startedAt, clock.endedAt])

  const view = clockView(clock, now, budgetMs)
  const current = steps[step]
  const fieldsOf = (s: StudioStep) => s.fields.map((f) => f.key)
  const required = new Set(DRAFT_FIELDS[feature].filter((f) => f.required).map((f) => f.key))
  const stepReady = (s: StudioStep) => fieldsOf(s).every((k) => !required.has(k) || (draft[k] ?? '').trim().length > 0)
  const doneSteps = steps.filter((s, i) => i < step || (phase !== 'build' && stepReady(s))).length

  const edit = (key: string, value: string) => {
    if (clock.startedAt === null) setClock(startClock(feature))
    setNow(wallClock())
    setDraft((d) => {
      const nextDraft = { ...d, [key]: value }
      try { window.localStorage.setItem(draftKey(feature), JSON.stringify(nextDraft)) } catch { /* private mode: the page still works */ }
      return nextDraft
    })
  }
  const focusCard = () => window.setTimeout(() => cardRef.current?.querySelector<HTMLElement>('input,textarea,button')?.focus({ preventScroll: true }), 60)
  const goNext = () => {
    setNote(null)
    if (step < steps.length - 1) { setStep(step + 1); focusCard(); return }
    setPhase('claim')
    focusCard()
  }
  const goBack = () => {
    setNote(null)
    if (phase === 'claim') { setPhase('build'); return }
    if (step > 0) setStep(step - 1)
  }
  const form = (extra: Record<string, string> = {}) => {
    const fd = new FormData()
    fd.set('feature', feature)
    fd.set('draft', JSON.stringify(cleanDraft(feature, draft)))
    for (const [k, v] of Object.entries(extra)) fd.set(k, v)
    return fd
  }
  const finish = () => start(async () => {
    setNote(null)
    const res = await finishSignedIn(form())
    if (!res.ok) { setNote(res.error); return }
    setClock(stopClock(feature))
    setNow(wallClock())
    setLiveHref(res.liveHref)
    try { window.localStorage.removeItem(draftKey(feature)) } catch { /* nothing kept */ }
    setPhase('done')
  })
  const sendLink = () => start(async () => {
    setNote(null)
    if (!EMAIL.test(email.trim())) { setNote('Enter a full email address.'); return }
    const res = await claimFeatureWithEmail(form({ email: email.trim() }))
    if (!res.ok) { setNote(res.error); return }
    setPhase('sent')
  })

  const elapsed = view.elapsedMs
  const under = elapsed > 0 && elapsed <= budgetMs
  return (
    <section id="get-started" className="cs-hero fb-hero" aria-labelledby="fb-h1" data-feature={feature} data-phase={phase}>
      <div className="fq-aura" aria-hidden="true" />
      <div className="fq-grain" aria-hidden="true" />
      <div className="fb-grid">
        <div className="fb-col">
          <div className="fb-top">
            <span className="fb-kicker"><FqIcon name={entry.icon} size={14} />{entry.name}<b>Free</b></span>
            <div className={`fb-clock fb-clock-${view.state}`} role="timer" aria-live="off" aria-label={view.aria}>
              <svg viewBox="0 0 36 36" className="fb-ring" aria-hidden="true">
                <circle cx="18" cy="18" r="15.5" className="fb-ring-bg" />
                <circle cx="18" cy="18" r="15.5" className="fb-ring-fg" style={{ strokeDashoffset: `${(1 - view.used) * 97.4}` }} />
              </svg>
              <span className="fb-clock-t">{view.state === 'ready' ? `Beat ${formatClock(budgetMs)}` : view.label}</span>
              <span className="fb-clock-k">{view.caption}</span>
            </div>
          </div>

          <h1 id="fb-h1" className="cs-h1 fb-h1">
            {phase === 'done' ? <>Your {entry.made} is <em className="fq-iri-text">live.</em></> : <>{copy.headline} <em className="fq-iri-text">in {entry.minutes} minutes.</em></>}
          </h1>
          <p className="cs-sub fb-sub">
            {phase === 'done'
              ? under ? `Built in ${formatClock(elapsed)}. That beat the clock.` : elapsed > 0 ? `Built in ${formatClock(elapsed)}. Nicely done.` : 'Saved and live. Change anything, any time.'
              : copy.sub}
          </p>

          <ol className="fb-steps" aria-label="Steps">
            {steps.map((s, i) => (
              <li key={s.id} className="fb-step" data-state={phase === 'done' || i < doneSteps ? 'done' : phase === 'build' && i === step ? 'now' : 'off'}>
                <span className="fb-step-dot">{phase === 'done' || i < doneSteps ? <FqIcon name="check" size={11} /> : i + 1}</span>
                <span className="fb-step-l">{s.label}</span>
              </li>
            ))}
            <li className="fb-step" data-state={phase === 'done' ? 'done' : phase === 'build' ? 'off' : 'now'}>
              <span className="fb-step-dot">{phase === 'done' ? <FqIcon name="check" size={11} /> : steps.length + 1}</span>
              <span className="fb-step-l">Go live</span>
            </li>
          </ol>

          <div ref={cardRef} className="fb-card-slot">
            {phase === 'build' && current ? (
              <div className="cs-card fb-card" key={current.id}>
                <div className="cs-card-head">
                  <span className="cs-card-eyebrow">Step {step + 1} of {steps.length + 1}</span>
                  <h2 className="cs-card-h">{current.title}</h2>
                  {current.sub ? <p className="cs-fine">{current.sub}</p> : null}
                </div>
                {current.fields.map((f) => (
                  <Field key={f.key} field={f} max={DRAFT_FIELDS[feature].find((d) => d.key === f.key)?.max} value={draft[f.key] ?? ''} onChange={(v) => edit(f.key, v)} />
                ))}
                {note ? <p className="cs-alert" role="alert">{note}</p> : null}
                <div className={step > 0 ? 'cs-foot cs-foot-between' : 'cs-foot'}>
                  {step > 0 ? <button type="button" className="cs-later" onClick={goBack}>Back</button> : null}
                  <button type="button" className="cs-next" disabled={!stepReady(current)} onClick={goNext}>
                    {step < steps.length - 1 ? 'Next' : 'Almost there'} <FqIcon name="arrow" />
                  </button>
                </div>
              </div>
            ) : null}

            {phase === 'claim' ? (
              <div className="cs-card fb-card">
                <div className="cs-card-head">
                  <span className="cs-card-eyebrow">Step {steps.length + 1} of {steps.length + 1}</span>
                  <h2 className="cs-card-h">{signedIn ? <>Ready? <em>Go live.</em></> : <>Save it and <em>go live.</em></>}</h2>
                  <p className="cs-fine">{signedIn ? 'It saves to your account right now. You can change anything later.' : copy.claimLine}</p>
                </div>
                {signedIn ? (
                  <button type="button" className="cs-next fb-wide" disabled={pending} onClick={finish}>
                    {pending ? 'Saving...' : copy.publishLabel} <FqIcon name="arrow" />
                  </button>
                ) : (
                  <>
                    <form action={claimFeatureWithGoogle}>
                      <input type="hidden" name="feature" value={feature} />
                      <input type="hidden" name="draft" value={JSON.stringify(cleanDraft(feature, draft))} />
                      <button type="submit" className="cs-google"><GoogleMark /> Continue with Google</button>
                    </form>
                    <div className="fb-or" aria-hidden="true"><span>or</span></div>
                    <label className="cs-field">
                      <span>Your email</span>
                      <Input variant="seamless" aria-label="Your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" />
                    </label>
                    <button type="button" className="cs-email-go" disabled={pending} onClick={sendLink}>
                      {pending ? 'Sending...' : 'Email me a link to finish'}
                    </button>
                  </>
                )}
                {note ? <p className="cs-alert" role="alert">{note}</p> : null}
                <div className="cs-foot cs-foot-between">
                  <button type="button" className="cs-later" onClick={goBack}>Back</button>
                  {!signedIn ? <span className="cs-fine">Free. No card.</span> : null}
                </div>
              </div>
            ) : null}

            {phase === 'sent' ? (
              <div className="cs-card fb-card" role="status">
                <div className="cs-card-head">
                  <span className="cs-card-eyebrow">Check your inbox</span>
                  <h2 className="cs-card-h">One tap and it&apos;s <em>live.</em></h2>
                  <p className="cs-fine">We sent a link to <b>{email}</b>. Open it on any device and your {entry.made} goes live. The clock has stopped, so take your time.</p>
                </div>
                <button type="button" className="cs-later" onClick={() => setPhase('claim')}>Use a different email</button>
              </div>
            ) : null}

            {phase === 'done' ? (
              <div className="cs-card fb-card fb-done">
                <div className="cs-acts">
                  {liveHref ? <Link href={liveHref} className="cs-go" target="_blank" rel="noopener">Open my {entry.made} <FqIcon name="arrow" /></Link> : null}
                </div>
                {next}
              </div>
            ) : null}
          </div>
        </div>

        <div className="fb-preview" aria-label={`Preview of your ${entry.made}`}>
          <div className="fb-glow" aria-hidden="true" />
          {preview(draft)}
          <span className="fb-draft-badge"><span className="cs-dot" />{phase === 'done' ? 'Live' : 'Draft, only you can see this'}</span>
        </div>
      </div>
    </section>
  )
}

function cleanSeed(feature: FeatureId, seed: Partial<FeatureDraft> | undefined): FeatureDraft {
  if (!seed) return {}
  const clean = cleanDraft(feature, seed)
  return Object.fromEntries(Object.entries(clean).filter(([, v]) => v))
}

function Field({ field, max, value, onChange }: { field: StudioField; max: number | undefined; value: string; onChange: (v: string) => void }) {
  const id = `fb-${field.key}`
  return (
    <div className="cs-field fb-field">
      <label htmlFor={field.kind === 'choice' ? undefined : id} id={`${id}-l`}><span>{field.label}{field.hint ? <i> {field.hint}</i> : null}</span></label>
      {field.kind === 'choice' ? (
        <div className="fb-choices" role="radiogroup" aria-labelledby={`${id}-l`}>
          {(field.options ?? []).map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className="fb-choice" onClick={() => onChange(o.value)}>
              <b>{o.label}</b>{o.hint ? <span>{o.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : field.kind === 'textarea' ? (
        <Textarea variant="seamless" id={id} aria-label={field.label} className="cs-offer" rows={field.rows ?? 3} value={value} placeholder={field.placeholder} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input variant="seamless" id={id} aria-label={field.label} type={field.kind === 'url' ? 'url' : field.kind === 'email' ? 'email' : 'text'} inputMode={field.kind === 'url' ? 'url' : undefined} value={value} placeholder={field.placeholder} maxLength={max} autoComplete={field.autoComplete} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.examples?.length ? (
        <div className="cs-chips fb-chips">
          {field.examples.map((x) => (
            <button key={x} type="button" className="cs-chip-btn" onClick={() => onChange(x)}>{x}</button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
