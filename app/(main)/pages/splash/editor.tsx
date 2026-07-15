'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Eye, RotateCcw } from 'lucide-react'
import type { VeraCopy } from '@/lib/onboarding/beta-script'
import {
  DEFAULT_SEQUENCE,
  type BetaSequence,
  type FunnelFeature,
  type FunnelCoreFeature,
  type FunnelDestination,
} from '@/lib/onboarding/beta-sequences'
import { FUNNEL_ICON_NAMES } from '@/lib/onboarding/funnel-icons'
import type { SequenceOverride } from '@/lib/onboarding/sequence-overrides'
import BetaInduction from '@/app/onboarding/beta/induction'
import { saveDefaultBetaCopy, resetDefaultBetaCopy } from './actions'
import { saveSequenceVersion, renameSequenceSlug } from '@/app/(main)/pages/sequences/builder-actions'

// Live-preview copy editor for a Splash Funnel. Left: one section per beat with an
// input for every voiced string (plus the three oath checkbox labels). Right: the
// REAL <BetaInduction> component rendered in preview mode at half scale, fed the
// edited copy, so the preview can't drift from what members see. Focusing a section
// (or using the tabs) switches the previewed beat.
//
// Reused for TWO surfaces (ADR-162 → splash-editor refactor):
//   • The DEFAULT template (slug `beta-default`, /pages/splash) — saves the
//     `beta-default` override via saveDefaultBetaCopy, with a reset-to-script button.
//   • Any CUSTOM funnel (slug = its own value, /pages/sequences/<slug>/edit) — saves
//     that slug's override via saveSequenceVersion, and exposes an editable title
//     (the funnel's `audience`). Publish state + splash/tag are carried forward.

type Oaths = BetaSequence['oaths']
type BeatKey = keyof VeraCopy

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-broadcast'
const LABEL = 'mb-1 block text-xs font-semibold text-subtle'

// Niche-funnel config (ADR-funnels). A niche funnel swaps the generic "who are you" step
// for 4 Slide-2 feature cards and the auto-playing reel for 3 Slide-3 core features + art,
// and admits members straight into the app instead of the Beta waitlist. All optional: an
// all-empty section stays unset so the induction falls back to the General funnel behaviour.
const SLIDE3_RENDER_KINDS = ['feed', 'circles', 'events', 'booking', 'checkin', 'donate', 'tickets', 'crm'] as const
type Slide3Render = (typeof SLIDE3_RENDER_KINDS)[number]

/** Always render a fixed 4 Slide-2 rows, seeded from the funnel's saved features. */
function seedSlide2(init?: FunnelFeature[]): FunnelFeature[] {
  return Array.from({ length: 4 }, (_, i) => init?.[i] ?? { title: '', blurb: '', icon: '' })
}

/** Always render a fixed 3 Slide-3 rows, seeded from the funnel's saved core features. */
function seedSlide3(init?: FunnelCoreFeature[]): FunnelCoreFeature[] {
  return Array.from({ length: 3 }, (_, i) => init?.[i] ?? { title: '', blurb: '', art: { kind: 'render', render: 'feed' } })
}

// The five beats in the order members walk them. `beatIndex` is the induction's
// internal step (0 oath · 1 intro · 2 tour · 3 identity+place · 4 enter). The old
// standalone "place" beat is merged into identity; its copy keys stay in VERA for
// any saved override but are no longer surfaced here.
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
    title: 'Beta Promise',
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
    title: 'Profile',
    sub: 'Name, handle, city, and face.',
    fields: [
      { key: 'heading', label: 'Heading' },
      { key: 'body', label: 'Body', area: true },
    ],
  },
  {
    id: 'enter',
    beatIndex: 4,
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
  slug = DEFAULT_SEQUENCE,
  initialAudience = '',
  initialVera,
  initialOaths,
  heardAbout,
  initialHasOverride,
  initialSlide2Features,
  initialSlide3Core,
  initialDestination,
}: {
  /** The funnel this editor writes. Defaults to the reserved default template. */
  slug?: string
  /** The custom funnel's title (audience). Editable for custom funnels only. */
  initialAudience?: string
  initialVera: VeraCopy
  initialOaths: Oaths
  /** "How did you hear?" options, passed through so the place beat previews true. */
  heardAbout: string[]
  initialHasOverride: boolean
  /** Niche-funnel config, seeded from the funnel's saved values (custom funnels only). */
  initialSlide2Features?: FunnelFeature[]
  initialSlide3Core?: FunnelCoreFeature[]
  initialDestination?: FunnelDestination
}) {
  const isDefault = slug === DEFAULT_SEQUENCE
  const router = useRouter()
  const [audience, setAudience] = useState(initialAudience)
  // Permalink (the funnel's slug). Editable for custom funnels; renaming re-keys the override row.
  const [permalink, setPermalink] = useState(slug)
  const [renaming, startRename] = useTransition()
  const [renameError, setRenameError] = useState<string | null>(null)
  const [vera, setVera] = useState<VeraCopy>(initialVera)
  const [oaths, setOaths] = useState<Oaths>(initialOaths)
  // Niche-funnel config. Fixed-length rows so the editor always shows all slots; an
  // all-empty section is dropped from the saved override (buildSlide2/3 / destination).
  const [slide2, setSlide2] = useState<FunnelFeature[]>(() => seedSlide2(initialSlide2Features))
  const [slide3, setSlide3] = useState<FunnelCoreFeature[]>(() => seedSlide3(initialSlide3Core))
  const [destMode, setDestMode] = useState<'waitlist' | 'direct'>(
    initialDestination?.mode === 'direct' ? 'direct' : 'waitlist',
  )
  const [destUrl, setDestUrl] = useState(initialDestination?.mode === 'direct' ? initialDestination.url : '')
  const [snapshot, setSnapshot] = useState(() =>
    JSON.stringify({
      audience: initialAudience,
      vera: initialVera,
      oaths: initialOaths,
      slide2: seedSlide2(initialSlide2Features),
      slide3: seedSlide3(initialSlide3Core),
      destMode: initialDestination?.mode === 'direct' ? 'direct' : 'waitlist',
      destUrl: initialDestination?.mode === 'direct' ? initialDestination.url : '',
    }),
  )
  const [hasOverride, setHasOverride] = useState(initialHasOverride)
  const [previewBeat, setPreviewBeat] = useState(0)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const dirty =
    JSON.stringify({ audience, vera, oaths, slide2, slide3, destMode, destUrl }) !== snapshot

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

  function setSlide2Field(i: number, field: 'title' | 'blurb' | 'icon', value: string) {
    setSlide2((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
    setSaved(false)
  }

  function setSlide3Text(i: number, field: 'title' | 'blurb', value: string) {
    setSlide3((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
    setSaved(false)
  }

  // The art picker: a render kind (reuse a product render) OR an image URL. Switching to
  // "image" keeps any src already typed; switching to a render drops the src.
  function setSlide3Art(i: number, value: string) {
    setSlide3((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r
        if (value === 'image') {
          const src = r.art.kind === 'image' ? r.art.src : ''
          return { ...r, art: { kind: 'image', src } }
        }
        return { ...r, art: { kind: 'render', render: value as Slide3Render } }
      }),
    )
    setSaved(false)
  }

  function setSlide3ImageSrc(i: number, value: string) {
    setSlide3((prev) =>
      prev.map((r, idx) => (idx === i && r.art.kind === 'image' ? { ...r, art: { kind: 'image', src: value } } : r)),
    )
    setSaved(false)
  }

  // Build the niche-funnel override fields from the fixed-length rows. An all-empty
  // section returns undefined so it's never written (the induction falls back).
  function buildSlide2(): FunnelFeature[] | undefined {
    if (!slide2.some((r) => r.title.trim() || r.blurb.trim())) return undefined
    return slide2.map((r) => ({ title: r.title.trim(), blurb: r.blurb.trim(), icon: r.icon }))
  }

  function buildSlide3(): FunnelCoreFeature[] | undefined {
    const has = slide3.some(
      (r) => r.title.trim() || r.blurb.trim() || (r.art.kind === 'image' && r.art.src.trim()),
    )
    if (!has) return undefined
    return slide3.map((r) => ({
      title: r.title.trim(),
      blurb: r.blurb.trim(),
      art:
        r.art.kind === 'image'
          ? { kind: 'image', src: r.art.src.trim() }
          : { kind: 'render', render: r.art.render },
    }))
  }

  function buildDestination(): FunnelDestination {
    return destMode === 'direct' && destUrl.trim() ? { mode: 'direct', url: destUrl.trim() } : { mode: 'waitlist' }
  }

  function save() {
    if (pending) return
    setError(null)
    start(async () => {
      // Default template → its dedicated action (unchanged behaviour). Custom funnel
      // → write that slug's override; saveSequenceVersion carries the funnel's publish
      // state, splash, and tag forward, so a copy edit never disturbs the lifecycle.
      if (isDefault) {
        const r = await saveDefaultBetaCopy({ vera, oaths })
        if (!r.ok) { setError('Could not save. Are you still signed in?'); return }
      } else {
        // Niche config only rides along for custom funnels. Send a field only when it has
        // real content, so an untouched funnel stays on the General funnel behaviour; the
        // completion destination always carries its explicit choice (waitlist vs direct).
        const override: SequenceOverride = { audience: audience.trim() || 'New funnel', vera, oaths }
        const s2 = buildSlide2()
        if (s2) override.slide2Features = s2
        const s3 = buildSlide3()
        if (s3) override.slide3Core = s3
        override.destination = buildDestination()
        const r = await saveSequenceVersion(slug, override)
        if (!r.ok) { setError('Could not save. Are you still signed in?'); return }
      }
      setSnapshot(JSON.stringify({ audience, vera, oaths, slide2, slide3, destMode, destUrl }))
      setHasOverride(true)
      setSaved(true)
      router.refresh()
    })
  }

  function reset() {
    if (pending || !isDefault) return
    if (!confirm('Reset to the built-in script? Your saved edits are removed.')) return
    setError(null)
    start(async () => {
      const r = await resetDefaultBetaCopy()
      if (!r.ok) { setError('Could not reset. Are you still signed in?'); return }
      setVera(r.vera)
      setOaths(r.oaths)
      setSnapshot(JSON.stringify({ audience, vera: r.vera, oaths: r.oaths, slide2, slide3, destMode, destUrl }))
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
        {/* Custom funnels carry their own title (the audience). The default template's
            title is fixed, so this only shows for a custom slug. */}
        {!isDefault && (
          <section className="space-y-2 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <label className={LABEL} htmlFor="splash-audience">
              Funnel title
              <span className="ml-1.5 font-normal text-subtle/70">· the audience this funnel is for</span>
            </label>
            <input
              id="splash-audience"
              className={FIELD}
              value={audience}
              placeholder="e.g. Local business owners"
              onChange={(e) => { setAudience(e.target.value); setSaved(false) }}
            />
          </section>
        )}
        {/* Permalink (the funnel's slug): the ?seq= value + the link you share. Renaming re-keys the
            funnel; existing links to the old permalink stop resolving. Custom funnels only. */}
        {!isDefault && (
          <section className="space-y-2 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <label className={LABEL} htmlFor="splash-permalink">
              Permalink
              <span className="ml-1.5 font-normal text-subtle/70">· the /onboarding/beta?seq= slug and the link you share</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2">
                <span className="shrink-0 text-xs text-subtle">?seq=</span>
                <input
                  id="splash-permalink"
                  className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none"
                  value={permalink}
                  placeholder="event-experience-hosts"
                  onChange={(e) => { setPermalink(e.target.value); setRenameError(null) }}
                />
              </div>
              <button
                type="button"
                disabled={renaming || !permalink.trim() || permalink.trim() === slug}
                onClick={() => {
                  setRenameError(null)
                  startRename(async () => {
                    const res = await renameSequenceSlug(slug, permalink)
                    if (!res.ok || !res.slug) {
                      setRenameError(res.error ?? 'Could not change the permalink.')
                      return
                    }
                    router.push(`/pages/sequences/${res.slug}/edit`)
                    router.refresh()
                  })
                }}
                className="shrink-0 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
              >
                {renaming ? 'Updating…' : 'Update permalink'}
              </button>
            </div>
            <p className="text-2xs text-subtle">
              Changing this updates the funnel&apos;s link everywhere. Existing links to the old permalink will stop working.
            </p>
            {renameError && <p className="text-2xs font-semibold text-danger">{renameError}</p>}
          </section>
        )}
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

        {/* ── Niche-funnel config (custom funnels only; the default template stays the
            General funnel, so these never show there) ── */}
        {!isDefault && (
          <>
            {/* 1. Slide 2 feature cards */}
            <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div>
                <h2 className="text-sm font-bold text-text">Slide 2 features</h2>
                <p className="text-xs text-muted">
                  {"Four cards shown in place of the persona fork. Leave these blank to keep the default 'who are you' step (used by the General funnel)."}
                </p>
              </div>
              {slide2.map((row, i) => (
                <div key={i} className="space-y-3 rounded-xl border border-border bg-surface-elevated p-3">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Feature {i + 1}</p>
                  <div>
                    <label className={LABEL} htmlFor={`slide2-title-${i}`}>Title</label>
                    <input
                      id={`slide2-title-${i}`}
                      className={FIELD}
                      value={row.title}
                      onChange={(e) => setSlide2Field(i, 'title', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor={`slide2-blurb-${i}`}>Blurb</label>
                    <input
                      id={`slide2-blurb-${i}`}
                      className={FIELD}
                      value={row.blurb}
                      onChange={(e) => setSlide2Field(i, 'blurb', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor={`slide2-icon-${i}`}>Icon</label>
                    <select
                      id={`slide2-icon-${i}`}
                      className={FIELD}
                      value={row.icon}
                      onChange={(e) => setSlide2Field(i, 'icon', e.target.value)}
                    >
                      <option value="">Default icon</option>
                      {FUNNEL_ICON_NAMES.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </section>

            {/* 2. Slide 3 core features + art */}
            <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div>
                <h2 className="text-sm font-bold text-text">Slide 3 core features</h2>
                <p className="text-xs text-muted">
                  {'Three core features shown in place of the auto-playing tour. Leave blank to keep the default tour.'}
                </p>
              </div>
              {slide3.map((row, i) => {
                const artValue = row.art.kind === 'image' ? 'image' : row.art.render
                return (
                  <div key={i} className="space-y-3 rounded-xl border border-border bg-surface-elevated p-3">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Core feature {i + 1}</p>
                    <div>
                      <label className={LABEL} htmlFor={`slide3-title-${i}`}>Title</label>
                      <input
                        id={`slide3-title-${i}`}
                        className={FIELD}
                        value={row.title}
                        onChange={(e) => setSlide3Text(i, 'title', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={LABEL} htmlFor={`slide3-blurb-${i}`}>Blurb</label>
                      <input
                        id={`slide3-blurb-${i}`}
                        className={FIELD}
                        value={row.blurb}
                        onChange={(e) => setSlide3Text(i, 'blurb', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={LABEL} htmlFor={`slide3-art-${i}`}>Art</label>
                      <select
                        id={`slide3-art-${i}`}
                        className={FIELD}
                        value={artValue}
                        onChange={(e) => setSlide3Art(i, e.target.value)}
                      >
                        {SLIDE3_RENDER_KINDS.map((kind) => (
                          <option key={kind} value={kind}>{kind}</option>
                        ))}
                        <option value="image">Image URL</option>
                      </select>
                    </div>
                    {row.art.kind === 'image' && (
                      <div>
                        <label className={LABEL} htmlFor={`slide3-art-src-${i}`}>Image URL</label>
                        <input
                          id={`slide3-art-src-${i}`}
                          className={FIELD}
                          value={row.art.src}
                          placeholder="/images/site/example.jpg"
                          onChange={(e) => setSlide3ImageSrc(i, e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </section>

            {/* 3. Completion destination */}
            <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div>
                <h2 className="text-sm font-bold text-text">Where it goes when they finish</h2>
                <p className="text-xs text-muted">
                  {'Keep the General funnel on the Beta waitlist; send niche funnels straight into the app.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Completion destination">
                <button
                  type="button"
                  aria-pressed={destMode === 'waitlist'}
                  onClick={() => { setDestMode('waitlist'); setSaved(false) }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    destMode === 'waitlist'
                      ? 'bg-primary text-on-primary'
                      : 'border border-border bg-surface text-subtle hover:bg-surface-elevated'
                  }`}
                >
                  Beta waitlist
                </button>
                <button
                  type="button"
                  aria-pressed={destMode === 'direct'}
                  onClick={() => { setDestMode('direct'); setSaved(false) }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    destMode === 'direct'
                      ? 'bg-primary text-on-primary'
                      : 'border border-border bg-surface text-subtle hover:bg-surface-elevated'
                  }`}
                >
                  Admit directly
                </button>
              </div>
              {destMode === 'direct' && (
                <div>
                  <label className={LABEL} htmlFor="dest-url">
                    In-app link
                    <span className="ml-1.5 font-normal text-subtle/70">· a path like /spaces or /booking</span>
                  </label>
                  <input
                    id="dest-url"
                    className={FIELD}
                    value={destUrl}
                    placeholder="/spaces"
                    onChange={(e) => { setDestUrl(e.target.value); setSaved(false) }}
                  />
                </div>
              )}
            </section>
          </>
        )}

        {/* Save / reset bar */}
        <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-border bg-surface p-3 shadow-md">
          {error && <span className="text-xs font-medium text-danger">{error}</span>}
          {dirty && !error && <span className="text-xs font-medium text-warning">Unsaved changes</span>}
          {saved && !dirty && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
              <Check className="h-3.5 w-3.5" /> {isDefault ? 'Saved and live' : 'Saved'}
            </span>
          )}
          {/* Reset-to-script only applies to the default template's override. */}
          {isDefault && (
            <button
              type="button"
              onClick={reset}
              disabled={pending || !hasOverride}
              title={hasOverride ? 'Remove your saved edits and return to the built-in script' : 'No saved edits to remove'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to script
            </button>
          )}
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
      {/* top-20 (not top-4) so the sticky preview clears the fixed site header instead of riding up
          under it and hiding the previewed CTA buttons. */}
      <div className="lg:sticky lg:top-20 lg:self-start">
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
                // Feed the SAME niche config the operator is editing into the preview, so the Welcome
                // beat shows THIS sequence's Slide-2 feature cards (not the general persona fork) and
                // the tour beat shows its Slide-3 core features + art. Without these the preview always
                // fell back to the General funnel regardless of what was typed here.
                slide2Features={buildSlide2()}
                slide3Core={buildSlide3()}
                destination={buildDestination()}
              />
            </div>
          </div>
        </div>
        <p className="mt-2 text-2xs text-subtle">
          Previewing <span className="font-semibold text-muted">{active.title}</span>. This is the real flow, rendered with your edits.{' '}
          {isDefault
            ? 'Saving publishes straight to /onboarding/beta.'
            : `Saving updates this funnel at /onboarding/beta?seq=${slug}. Publish it from the funnels list to take it live.`}
        </p>
      </div>
    </div>
  )
}
