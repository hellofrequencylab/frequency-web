'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Eye, RotateCcw } from 'lucide-react'
import type { VeraCopy } from '@/lib/onboarding/beta-script'
import type { BetaSequence } from '@/lib/onboarding/beta-sequences'
import BetaInduction from '@/app/onboarding/beta/induction'
import { saveDefaultBetaCopy, resetDefaultBetaCopy } from './actions'

// Live-preview editor for the DEFAULT beta flow. Left: one section per beat with
// an input for every voiced string (plus the three oath checkbox labels). Right:
// the REAL <BetaInduction> component rendered in preview mode at half scale, fed
// the edited copy, so the preview can't drift from what members see. Focusing a
// section (or using the tabs) switches the previewed beat.

type Oaths = BetaSequence['oaths']
type BeatKey = keyof VeraCopy

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-broadcast'
const LABEL = 'mb-1 block text-xs font-semibold text-subtle'

// The six beats in the order members walk them. `beatIndex` is the induction's
// internal step (0 oath · 1 intro · 2 tour · 3 identity · 4 place · 5 enter).
const BEATS: {
  id: BeatKey
  beatIndex: number
  title: string
  sub: string
  fields: { key: string; label: string; area?: boolean }[]
}[] = [
  {
    id: 'oath',
    beatIndex: 0,
    title: 'The oath',
    sub: 'The promise they make before they come in.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow' },
      { key: 'heading', label: 'Heading' },
      { key: 'body', label: 'Body', area: true },
      { key: 'cta', label: 'Button label' },
    ],
  },
  {
    id: 'intro',
    beatIndex: 1,
    title: 'Welcome',
    sub: 'Who they are now that they said yes.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow' },
      { key: 'heading', label: 'Heading' },
      { key: 'body', label: 'Body', area: true },
      { key: 'cta', label: 'Button label' },
    ],
  },
  {
    id: 'tour',
    beatIndex: 2,
    title: 'The tour',
    sub: 'The three-room reel.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow' },
      { key: 'heading', label: 'Heading' },
      { key: 'body', label: 'Body', area: true },
      { key: 'cta', label: 'Button label (last slide)' },
    ],
  },
  {
    id: 'identity',
    beatIndex: 3,
    title: 'Identity',
    sub: 'Name, handle, and face.',
    fields: [
      { key: 'heading', label: 'Heading' },
      { key: 'body', label: 'Body', area: true },
    ],
  },
  {
    id: 'place',
    beatIndex: 4,
    title: 'Place',
    sub: 'Their city and what they came for.',
    fields: [
      { key: 'heading', label: 'Heading' },
      { key: 'body', label: 'Body', area: true },
      { key: 'intentLabel', label: 'Intent question label' },
      { key: 'intentPlaceholder', label: 'Intent placeholder' },
    ],
  },
  {
    id: 'enter',
    beatIndex: 5,
    title: 'Step in',
    sub: 'The last beat before the feed.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow' },
      { key: 'heading', label: 'Heading' },
      { key: 'body', label: 'Body', area: true },
      { key: 'cta', label: 'Button label' },
    ],
  },
]

export function SplashCopyEditor({
  initialVera,
  initialOaths,
  heardAbout,
  initialHasOverride,
}: {
  initialVera: VeraCopy
  initialOaths: Oaths
  /** "How did you hear?" options, passed through so the place beat previews true. */
  heardAbout: string[]
  initialHasOverride: boolean
}) {
  const router = useRouter()
  const [vera, setVera] = useState<VeraCopy>(initialVera)
  const [oaths, setOaths] = useState<Oaths>(initialOaths)
  const [snapshot, setSnapshot] = useState(() => JSON.stringify({ vera: initialVera, oaths: initialOaths }))
  const [hasOverride, setHasOverride] = useState(initialHasOverride)
  const [previewBeat, setPreviewBeat] = useState(0)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const dirty = JSON.stringify({ vera, oaths }) !== snapshot

  // Warn before a full navigation / tab close with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  function setField(beat: BeatKey, field: string, value: string) {
    setVera((prev) => ({ ...prev, [beat]: { ...prev[beat], [field]: value } }))
    setSaved(false)
  }

  function setOathLabel(i: number, value: string) {
    setOaths((prev) => prev.map((o, idx) => (idx === i ? { ...o, label: value } : o)))
    setSaved(false)
  }

  function save() {
    if (pending) return
    setError(null)
    start(async () => {
      const r = await saveDefaultBetaCopy({ vera, oaths })
      if (!r.ok) { setError('Could not save. Are you still signed in?'); return }
      setSnapshot(JSON.stringify({ vera, oaths }))
      setHasOverride(true)
      setSaved(true)
      router.refresh()
    })
  }

  function reset() {
    if (pending) return
    if (!confirm('Reset to the built-in script? Your saved edits are removed.')) return
    setError(null)
    start(async () => {
      const r = await resetDefaultBetaCopy()
      if (!r.ok) { setError('Could not reset. Are you still signed in?'); return }
      setVera(r.vera)
      setOaths(r.oaths)
      setSnapshot(JSON.stringify({ vera: r.vera, oaths: r.oaths }))
      setHasOverride(false)
      setSaved(false)
      router.refresh()
    })
  }

  const active = BEATS.find((b) => b.beatIndex === previewBeat) ?? BEATS[0]

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ── Editor: one section per beat ── */}
      <div className="space-y-4">
        {BEATS.map((b) => (
          <section
            key={b.id}
            onFocusCapture={() => setPreviewBeat(b.beatIndex)}
            className={`space-y-3 rounded-2xl border bg-surface p-5 shadow-sm transition-colors ${
              previewBeat === b.beatIndex ? 'border-primary/50' : 'border-border'
            }`}
          >
            <div>
              <h2 className="text-sm font-bold text-text">
                {b.beatIndex + 1}. {b.title}
              </h2>
              <p className="text-xs text-muted">{b.sub}</p>
            </div>
            {b.fields.map((f) => (
              <div key={f.key}>
                <label className={LABEL} htmlFor={`splash-${b.id}-${f.key}`}>
                  {f.label}
                  {f.key === 'heading' && (
                    <span className="ml-1.5 font-normal text-subtle/70">· wrap a word in *asterisks* for the accent color</span>
                  )}
                </label>
                {f.area ? (
                  <textarea
                    id={`splash-${b.id}-${f.key}`}
                    rows={3}
                    className={`${FIELD} resize-y`}
                    value={(vera[b.id] as Record<string, string>)[f.key] ?? ''}
                    onChange={(e) => setField(b.id, f.key, e.target.value)}
                  />
                ) : (
                  <input
                    id={`splash-${b.id}-${f.key}`}
                    className={FIELD}
                    value={(vera[b.id] as Record<string, string>)[f.key] ?? ''}
                    onChange={(e) => setField(b.id, f.key, e.target.value)}
                  />
                )}
              </div>
            ))}
            {b.id === 'oath' && (
              <div className="space-y-3 border-t border-border pt-3">
                {oaths.map((o, i) => (
                  <div key={o.id}>
                    <label className={LABEL} htmlFor={`splash-oath-label-${i}`}>
                      Checkbox {i + 1}
                    </label>
                    <input
                      id={`splash-oath-label-${i}`}
                      className={FIELD}
                      value={o.label}
                      onChange={(e) => setOathLabel(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        {/* Save / reset bar */}
        <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-border bg-surface p-3 shadow-md">
          {error && <span className="text-xs font-medium text-danger">{error}</span>}
          {dirty && !error && <span className="text-xs font-medium text-warning">Unsaved changes</span>}
          {saved && !dirty && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
              <Check className="h-3.5 w-3.5" /> Saved and live
            </span>
          )}
          <button
            type="button"
            onClick={reset}
            disabled={pending || !hasOverride}
            title={hasOverride ? 'Remove your saved edits and return to the built-in script' : 'No saved edits to remove'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to script
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {pending ? 'Working…' : 'Save & publish'}
          </button>
        </div>
      </div>

      {/* ── Live preview: the real induction, one beat at a time ── */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-subtle">
            <Eye className="h-3.5 w-3.5" /> Live preview
            {dirty && <span className="font-normal text-warning">· unpublished edits</span>}
          </p>
          <div className="flex flex-wrap gap-1.5" aria-label="Preview beat">
            {BEATS.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={previewBeat === b.beatIndex}
                onClick={() => setPreviewBeat(b.beatIndex)}
                className={`rounded-full px-2.5 py-1 text-2xs font-semibold transition-colors ${
                  previewBeat === b.beatIndex
                    ? 'bg-primary text-on-primary'
                    : 'border border-border bg-surface text-subtle hover:bg-surface-elevated'
                }`}
              >
                {b.title}
              </button>
            ))}
          </div>
        </div>

        {/* The REAL induction component (preview mode: nothing is saved), scaled to
            half so a full screen fits the pane. Inert: the tabs drive navigation. */}
        <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
          <div aria-hidden className="pointer-events-none h-[50vh] w-full select-none overflow-hidden">
            <div className="h-[200%] w-[200%] origin-top-left scale-50">
              <BetaInduction
                key={previewBeat}
                preview
                initialBeat={previewBeat}
                copy={{ vera, oaths, heardAbout }}
              />
            </div>
          </div>
        </div>
        <p className="mt-2 text-2xs text-subtle">
          Previewing <span className="font-semibold text-muted">{active.title}</span>. This is the real flow, rendered with your edits. Saving publishes straight to /onboarding/beta.
        </p>
      </div>
    </div>
  )
}
