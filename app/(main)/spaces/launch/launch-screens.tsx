// The Owner Launch screens, presentational only (no state, no server calls), so the flow in
// launch-flow.tsx stays small and each screen can be rendered on its own at phone and desktop width.
// Everything is the members kit: `.chip` pills, `.card`, the `.k` eyebrow, the Unbounded `.h1` with a
// serif italic last word, the pastel `.orb`. One question per screen, big tap targets.

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Textarea, Input } from '@/components/ui/field'
import { FqIcon } from '@/components/frequency/icon'
import { wizardPrimaryClass, wizardSecondaryClass } from '@/components/templates'
import { LAUNCH_MOODS, type LaunchQuestion } from '@/lib/importer/launch'
import type { LaunchStatus } from './actions'

/** The kit's heading lockup: Unbounded, with the last word in Instrument Serif italic. */
export function lockup(title: string): ReactNode {
  const i = title.lastIndexOf(' ')
  if (i < 0) return title
  const last = title.slice(i + 1).replace(/[?.!]+$/, '')
  const tail = title.slice(i + 1 + last.length)
  return (
    <>
      {title.slice(0, i)} <span className="serif">{last}</span>
      {tail}
    </>
  )
}

/** The soft pastel wash and the orb every launch screen sits on. */
export function LaunchBackdrop({ children, orb = true }: { children: ReactNode; orb?: boolean }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-72 opacity-80 blur-2xl"
        // token-ok: a mask only reads the alpha channel, so any opaque colour works; it paints nothing.
        style={{ background: 'var(--fq-pa-soft)', maskImage: 'radial-gradient(ellipse at 50% 0%, #000 0%, transparent 70%)' }}
      />
      {orb && <span aria-hidden className="orb pointer-events-none absolute right-6 top-14 sm:right-2" />}
      {children}
    </div>
  )
}

/** The answer field for one question: a line, a few sentences, or the mood pills. */
export function LaunchField({
  question,
  value,
  onChange,
}: {
  question: LaunchQuestion
  value: string
  onChange: (v: string) => void
}) {
  if (question.kind === 'mood') {
    return (
      <div className="space-y-3">
        <div className="chips flex flex-wrap gap-2" role="group" aria-label="What it should feel like">
          {LAUNCH_MOODS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={value === m.key ? 'chip on' : 'chip'}
              aria-pressed={value === m.key}
              onClick={() => onChange(value === m.key ? '' : m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="why">{LAUNCH_MOODS.find((m) => m.key === value)?.description ?? 'Skip it and we will pick a warm one.'}</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {question.kind === 'long' ? (
        <Textarea
          id={`launch-${question.id}`}
          aria-label={question.title}
          value={value}
          rows={4}
          maxLength={1500}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={`launch-${question.id}`}
          aria-label={question.title}
          value={value}
          maxLength={200}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {question.example && (
        <button type="button" className="chip" onClick={() => onChange(question.example ?? '')}>
          <FqIcon name="vera" size={16} />
          Use an example
        </button>
      )}
    </div>
  )
}

/** The waiting screen: Vera is writing. Calm, honest, no fake percentages. */
export function LaunchWorking({ name }: { name: string }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
      <span aria-hidden className="orb mx-auto mb-8 block size-16" />
      <p className="k mb-3">Launching</p>
      <h2 className="h1">{lockup(`Vera is drafting ${name || 'your page'}`)}</h2>
      <p className="meta mt-4">
        She reads what you wrote, writes your story, picks your sections and lays the page out. This usually takes a minute or two.
      </p>
      <p className="why mt-6 inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> You can leave this open.
      </p>
    </div>
  )
}

/** The look-over: what Vera drafted, before anything goes live. */
export function LaunchPreview({
  preview,
  busy,
  error,
  onLaunch,
  onBack,
}: {
  preview: NonNullable<LaunchStatus['preview']>
  busy: boolean
  error: string | null
  onLaunch: () => void
  onBack: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <p className="k mb-3">Your draft</p>
      <h2 className="h1">{lockup('Here is your page')}</h2>
      <p className="meta mt-3">Look it over. You can change anything after you launch.</p>

      <div className="card mt-6 space-y-4 p-5">
        <div>
          <p className="h3">{preview.name}</p>
          {preview.tagline && <p className="why mt-1">{preview.tagline}</p>}
        </div>
        {preview.about && <p className="body">{preview.about}</p>}
        {preview.offerings.length > 0 && (
          <div className="chips flex flex-wrap gap-2">
            {preview.offerings.map((o) => (
              <span key={o.title} className="chip">
                {o.title}
                {typeof o.price === 'number' ? ` · $${o.price}` : ''}
              </span>
            ))}
          </div>
        )}
        {preview.faqCount > 0 && <p className="meta">{preview.faqCount} common questions answered.</p>}
      </div>

      {error && <p className="mt-4 text-body-sm text-warning">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onBack} disabled={busy} className={`${wizardSecondaryClass} flex-1`}>
          Back
        </button>
        <button type="button" onClick={onLaunch} disabled={busy} className={`${wizardPrimaryClass} flex-1`}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Launch my page
        </button>
      </div>
    </div>
  )
}
