'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, ExternalLink, ArrowRight, Eye,
} from 'lucide-react'
import type { BetaSequence } from '@/lib/onboarding/beta-sequences'
import type { SequenceOverride } from '@/lib/onboarding/sequence-overrides'
import { uploadSplashImage } from '@/app/(main)/pages/sequences/[slug]/edit/actions'
import { saveSequenceVersion } from '@/app/(main)/pages/sequences/builder-actions'

// The guided beat-by-beat builder (ADR-162): one screen per beat of the real
// /onboarding/beta induction, each with an in-page preview that mirrors how that beat
// presents. Saving writes the full sequence override; "View live" opens the actual
// cinematic flow with this version's copy.

type StepId = 'meta' | 'splash' | 'oath' | 'intro' | 'identity' | 'place' | 'tour' | 'enter' | 'oaths' | 'heard' | 'review'
type Beat = 'oath' | 'intro' | 'identity' | 'place' | 'tour' | 'enter'

const STEPS: { id: StepId; title: string; sub: string }[] = [
  { id: 'meta', title: 'Version', sub: 'Who it’s for' },
  { id: 'splash', title: 'Splash', sub: 'The entry hero' },
  { id: 'oath', title: 'The oath', sub: 'Before they come in' },
  { id: 'intro', title: 'Welcome', sub: 'The intro beat' },
  { id: 'identity', title: 'Identity', sub: 'Name & face' },
  { id: 'place', title: 'Place', sub: 'Where they are' },
  { id: 'tour', title: 'The tour', sub: 'Three rooms' },
  { id: 'enter', title: 'Step in', sub: 'Meet Vera' },
  { id: 'oaths', title: 'Oath checks', sub: 'The three promises' },
  { id: 'heard', title: 'How they heard', sub: 'Attribution' },
  { id: 'review', title: 'Review', sub: 'Save & preview' },
]

const field = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-broadcast'
const lbl = 'block text-xs font-semibold text-subtle mb-1'

function withAccents(text: string): ReactNode {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
      <em key={i} className="font-bold not-italic text-primary-strong">{part.slice(1, -1)}</em>
    ) : part,
  )
}

export function SequenceWizard({ slug, initial, isCustom }: { slug: string; initial: BetaSequence; isCustom: boolean }) {
  const router = useRouter()
  const [seq, setSeq] = useState<BetaSequence>(initial)
  const [step, setStep] = useState(0)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const dirty = !saved && JSON.stringify(seq) !== JSON.stringify(initial)
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // ── setters ──
  const setTop = (k: 'audience' | 'marketingTag', v: string) => { setSeq((s) => ({ ...s, [k]: v })); setSaved(false) }
  const setSplash = (k: keyof BetaSequence['splash'], v: string) => { setSeq((s) => ({ ...s, splash: { ...s.splash, [k]: v } })); setSaved(false) }
  const setBeat = (beat: Beat, f: string, v: string) => { setSeq((s) => ({ ...s, vera: { ...s.vera, [beat]: { ...s.vera[beat], [f]: v } } })); setSaved(false) }
  const setOath = (i: number, v: string) => { setSeq((s) => ({ ...s, oaths: s.oaths.map((o, idx) => idx === i ? { ...o, label: v } : o) })); setSaved(false) }
  const setHeard = (lines: string) => { setSeq((s) => ({ ...s, heardAbout: lines.split('\n').map((l) => l.trim()).filter(Boolean) })); setSaved(false) }

  function onPickImage(file: File | null | undefined) {
    if (!file) return
    setUploading(true)
    const fd = new FormData(); fd.set('file', file)
    void uploadSplashImage(fd).then((r) => {
      setUploading(false)
      if (!('error' in r)) setSplash('image', r.url)
    })
  }

  function save() {
    if (pending) return
    const override: SequenceOverride = {
      audience: seq.audience,
      marketingTag: seq.marketingTag,
      splash: seq.splash,
      vera: seq.vera,
      oaths: seq.oaths,
      heardAbout: seq.heardAbout,
    }
    start(async () => {
      const r = await saveSequenceVersion(slug, override)
      if (r.ok) { setSaved(true); router.refresh() }
    })
  }

  const cur = STEPS[step]
  const liveHref = `/onboarding/beta?seq=${encodeURIComponent(slug)}`
  const beatField = (beat: Beat, f: string, label: string, area = false) => (
    <div>
      <label className={lbl}>
        {label}
        {f === 'heading' && <span className="ml-1.5 font-normal text-subtle/70">· wrap a word in *asterisks* for the accent color</span>}
      </label>
      {area
        ? <textarea className={`${field} resize-y`} rows={3} value={(seq.vera[beat] as Record<string, string>)[f] ?? ''} onChange={(e) => setBeat(beat, f, e.target.value)} />
        : <input className={field} value={(seq.vera[beat] as Record<string, string>)[f] ?? ''} onChange={(e) => setBeat(beat, f, e.target.value)} />}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Step rail */}
      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(i)}
            className={`rounded-full px-2.5 py-1 text-2xs font-semibold transition-colors ${
              i === step ? 'bg-primary text-on-primary' : i < step ? 'bg-broadcast-bg text-broadcast-strong' : 'border border-border bg-surface text-subtle hover:bg-surface-elevated'
            }`}
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Editor ── */}
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Step {step + 1} of {STEPS.length}</p>
            <h2 className="text-lg font-bold text-text">{cur.title}</h2>
            <p className="text-xs text-muted">{cur.sub}</p>
          </div>

          {cur.id === 'meta' && (
            <>
              <div><label className={lbl}>Audience <span className="font-normal text-subtle/70">· admin/analytics label</span></label>
                <input className={field} value={seq.audience} onChange={(e) => setTop('audience', e.target.value)} /></div>
              <div><label className={lbl}>Marketing tag <span className="font-normal text-subtle/70">· stamped on members who arrive here</span></label>
                <input className={field} value={seq.marketingTag} onChange={(e) => setTop('marketingTag', e.target.value)} /></div>
              <p className="rounded-lg bg-surface-elevated/50 px-3 py-2 text-2xs text-subtle">Slug: <code className="font-mono text-muted">{slug}</code> · Link: <code className="font-mono text-muted">/onboarding/beta?seq={slug}</code></p>
            </>
          )}

          {cur.id === 'splash' && (
            <>
              <div><label className={lbl}>Eyebrow</label><input className={field} value={seq.splash.eyebrow} onChange={(e) => setSplash('eyebrow', e.target.value)} /></div>
              <div><label className={lbl}>Headline</label><input className={field} value={seq.splash.headline} onChange={(e) => setSplash('headline', e.target.value)} /></div>
              <div><label className={lbl}>Body</label><textarea className={`${field} resize-y`} rows={3} value={seq.splash.body} onChange={(e) => setSplash('body', e.target.value)} /></div>
              <div><label className={lbl}>Statement <span className="font-normal text-subtle/70">· wrap the accent word in *asterisks*</span></label><input className={field} value={seq.splash.statement} onChange={(e) => setSplash('statement', e.target.value)} /></div>
              <div><label className={lbl}>CTA label</label><input className={field} value={seq.splash.cta} onChange={(e) => setSplash('cta', e.target.value)} /></div>
              <div>
                <label className={lbl}>Hero image</label>
                <div className="flex items-center gap-2">
                  <input className={field} value={seq.splash.image} onChange={(e) => setSplash('image', e.target.value)} placeholder="/images/site/…" />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-surface-elevated disabled:opacity-50">
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}{uploading ? 'Uploading…' : 'Upload'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
                </div>
              </div>
              <div><label className={lbl}>Image alt</label><input className={field} value={seq.splash.imageAlt} onChange={(e) => setSplash('imageAlt', e.target.value)} /></div>
            </>
          )}

          {cur.id === 'oath' && (<>{beatField('oath', 'eyebrow', 'Eyebrow')}{beatField('oath', 'heading', 'Heading')}{beatField('oath', 'body', 'Body', true)}{beatField('oath', 'cta', 'CTA label')}</>)}
          {cur.id === 'intro' && (<>{beatField('intro', 'eyebrow', 'Eyebrow')}{beatField('intro', 'heading', 'Heading')}{beatField('intro', 'body', 'Body', true)}{beatField('intro', 'cta', 'CTA label')}</>)}
          {cur.id === 'identity' && (<>{beatField('identity', 'heading', 'Heading')}{beatField('identity', 'body', 'Body', true)}</>)}
          {cur.id === 'place' && (<>{beatField('place', 'heading', 'Heading')}{beatField('place', 'body', 'Body', true)}</>)}
          {cur.id === 'tour' && (<>{beatField('tour', 'eyebrow', 'Eyebrow')}{beatField('tour', 'heading', 'Heading')}{beatField('tour', 'body', 'Body', true)}{beatField('tour', 'cta', 'CTA label')}</>)}
          {cur.id === 'enter' && (<>{beatField('enter', 'eyebrow', 'Eyebrow')}{beatField('enter', 'heading', 'Heading')}{beatField('enter', 'body', 'Body', true)}{beatField('enter', 'cta', 'CTA label')}</>)}

          {cur.id === 'oaths' && (
            <>
              <p className="text-xs text-muted">The three promises they tick to enter.</p>
              {seq.oaths.map((o, i) => (
                <div key={o.id}><label className={lbl}>Oath {i + 1} <span className="font-normal text-subtle/70">({o.id})</span></label>
                  <input className={field} value={o.label} onChange={(e) => setOath(i, e.target.value)} /></div>
              ))}
            </>
          )}

          {cur.id === 'heard' && (
            <div><label className={lbl}>“How did you hear?” options <span className="font-normal text-subtle/70">· one per line</span></label>
              <textarea className={`${field} resize-y`} rows={7} value={seq.heardAbout.join('\n')} onChange={(e) => setHeard(e.target.value)} /></div>
          )}

          {cur.id === 'review' && (
            <div className="space-y-2 text-sm">
              <p className="text-muted">Saving publishes this version immediately. It renders the real induction at <code className="font-mono text-xs">/onboarding/beta?seq={slug}</code>.</p>
              <ul className="space-y-1 text-xs text-muted">
                <li><span className="font-semibold text-text">Audience:</span> {seq.audience}</li>
                <li><span className="font-semibold text-text">Tag:</span> {seq.marketingTag}</li>
                <li><span className="font-semibold text-text">Splash:</span> {seq.splash.headline}</li>
              </ul>
            </div>
          )}

          {/* Footer nav */}
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-text disabled:opacity-30">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="flex items-center gap-2">
              {dirty && <span className="text-2xs font-medium text-warning">Unsaved</span>}
              {saved && <span className="inline-flex items-center gap-1 text-2xs font-semibold text-success"><Check className="h-3 w-3" /> Saved</span>}
              <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40">
                {pending ? 'Saving…' : 'Save & publish'}
              </button>
              {step < STEPS.length - 1 && (
                <button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated">
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Live beat preview ── */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-subtle"><Eye className="h-3.5 w-3.5" /> Preview {dirty && <span className="font-normal text-warning">· unpublished</span>}</p>
            <a href={liveHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline">
              <ExternalLink className="h-3 w-3" /> View live induction
            </a>
          </div>
          <StepPreview step={cur.id} seq={seq} />
          {isCustom && <p className="mt-2 text-2xs text-subtle">Custom version. Edit any beat and re-publish; the slug + link stay the same.</p>}
        </div>
      </div>
    </div>
  )
}

// A faithful-enough render of the current beat, mirroring the induction's centered layout.
function StepPreview({ step, seq }: { step: StepId; seq: BetaSequence }) {
  if (step === 'splash') {
    const s = seq.splash
    return (
      <Card>
        {s.image
          ? // eslint-disable-next-line @next/next/no-img-element
            <img src={s.image} alt={s.imageAlt || ''} className="h-40 w-full object-cover" />
          : <div className="h-40 w-full bg-gradient-to-br from-primary via-signal to-signal-strong opacity-80" />}
        <div className="p-6 text-center">
          {s.eyebrow && <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-primary-strong">{s.eyebrow}</p>}
          {s.headline && <p className="mt-2 text-balance text-2xl font-bold leading-tight text-text">{s.headline}</p>}
          {s.body && <p className="mx-auto mt-2 max-w-lg whitespace-pre-line text-sm leading-relaxed text-muted">{s.body}</p>}
          {s.statement && <p className="mx-auto mt-3 max-w-lg text-sm font-semibold text-text">{withAccents(s.statement)}</p>}
          {s.cta && <CtaBtn>{s.cta}</CtaBtn>}
        </div>
      </Card>
    )
  }
  if (step === 'oaths') {
    return (
      <Card>
        <div className="p-6 text-center">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-primary-strong">{seq.vera.oath.eyebrow}</p>
          <p className="mt-2 text-2xl font-bold leading-tight text-text">{withAccents(seq.vera.oath.heading)}</p>
          <div className="mx-auto mt-4 max-w-sm space-y-2 text-left">
            {seq.oaths.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
                <span className="h-5 w-5 shrink-0 rounded-md border border-border" />
                <span className="text-sm font-medium text-muted">{o.label}</span>
              </div>
            ))}
          </div>
          <CtaBtn>{seq.vera.oath.cta}</CtaBtn>
        </div>
      </Card>
    )
  }
  if (step === 'heard') {
    return (
      <Card>
        <div className="p-6 text-center">
          <p className="text-2xl font-bold leading-tight text-text">How did you hear about us?</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {seq.heardAbout.map((h) => <span key={h} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted">{h}</span>)}
          </div>
        </div>
      </Card>
    )
  }
  if (step === 'meta' || step === 'review') {
    return (
      <Card>
        <div className="space-y-2 p-6 text-center">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-primary-strong">{seq.audience}</p>
          <p className="text-xl font-bold text-text">{seq.splash.headline}</p>
          <p className="text-xs text-muted">Tag: {seq.marketingTag}</p>
        </div>
      </Card>
    )
  }
  // Vera beats (oath/intro/identity/place/tour/enter)
  const beat = seq.vera[step as Beat] as { eyebrow?: string; heading: string; body: string; cta?: string }
  return (
    <Card>
      <div className="p-8 text-center">
        {beat.eyebrow && <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-primary-strong">{beat.eyebrow}</p>}
        <p className="mt-2 text-3xl font-bold leading-tight text-text">{withAccents(beat.heading)}</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">{beat.body}</p>
        {beat.cta && <CtaBtn>{beat.cta}</CtaBtn>}
      </div>
    </Card>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">{children}</div>
}
function CtaBtn({ children }: { children: ReactNode }) {
  return (
    <span className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary">
      {children} <ArrowRight className="h-3.5 w-3.5" />
    </span>
  )
}
