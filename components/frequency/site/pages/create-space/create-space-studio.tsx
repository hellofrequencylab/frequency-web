'use client'

// /create-a-space, the client island: one hero that is the whole builder (docs/design-systems/create-a-space,
// README section 2). The H1 starts as the promise and becomes the clock; the step cards come and go in the left
// column while the preview on the right fills in; saved steps collapse to pills; the steps bar reads "built", never
// "live". One state object feeds all of it. The kit arrives as ?kit=<MegaThemeId> from the Theme Kit pages; no param
// starts on the house look. Server markup is the cold-traffic render (the intro), so the page reads without script.
// The draft lives in the visitor's own browser until the hand-over (create-space-claim.tsx). Styles: create-space.css.
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { SaveCard, SavedCard } from '@/components/frequency/site/pages/create-space/create-space-claim'
import type { Saved } from '@/components/frequency/site/pages/create-space/create-space-claim'
import { ContactCard, MOCKUP_LINES, NameCard, OfferCard, PhotosCard } from '@/components/frequency/site/pages/create-space/create-space-steps'
import type { StepError } from '@/components/frequency/site/pages/create-space/create-space-steps'
import { SpacePreview } from '@/components/frequency/site/pages/create-space/space-preview'
import { useHandleStatus } from '@/components/frequency/site/pages/create-space/use-handle-status'
import {
  BUILDER_MOVES, DRAFT_KEY, STEP_SEGMENTS, claimedHandle, emptyDraft, handleOf, hasProgress, initialOf, nextOpenMove, progressOf,
  readStoredDraft, serializeDraft, startingModeFor, stepPrompt,
} from '@/lib/create-space/builder'
import type { BuilderDraft, BuilderMove } from '@/lib/create-space/builder'
import { isHandleShape } from '@/lib/create-space/handle'
import { intentsFromOffer } from '@/lib/create-space/intents-from-offer'
import { PREVIEW_KITS, deriveSite, isPreviewKit, joinList, kitAccents, kitImagery } from '@/lib/create-space/preview-site'
import { CLOCK_BUDGET_MS, formatClock } from '@/lib/launch/clock'
import type { MegaThemeId } from '@/lib/theme/mega-theme'
import { PREVIEW_FONT_SHEET, previewAccentVars, previewTokens } from '@/lib/theme/preview-tokens'
import './create-space.css'

const COLD_KIT: MegaThemeId = 'frequency'
/** The hero wears its mode as a class too, so a probe and a test can read it off the markup. */
const HERO_CLASS = { intro: 'cs-hero cs-hero-intro', building: 'cs-hero cs-hero-building' } as const
const ROW_LABELS = ['Name', 'Offer', 'Contact', 'Photos'] as const
const INTRO_SUB = 'You have a practice, a studio, a gathering or a group, and the tools are scattered. Build one home for all of it: your website, Spotlight, bookings and people.'
/** The mock-up moment is never shorter than this, so the lines are read, not flashed. */
const MOCKUP_MIN_MS = 2600
const MOCKUP_LINE_MS = 600
const TOAST_MS = 3200
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The kit a visit starts on, and whether the visitor arrived having chosen it. Total. */
export function arrivalFromParam(param: string | null): { kit: MegaThemeId; chosen: boolean } {
  if (param && isPreviewKit(param)) return { kit: param, chosen: true }
  return { kit: COLD_KIT, chosen: false }
}

const lightGround = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16)
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) > 0.4
}

/** A kit slot (s0, s1...) to its picture, else the kit's own. Uploads (`up`) come with LIVE-1966. */
const slotSrc = (slot: string, list: readonly string[], fallback: string) => {
  const m = /^s(\d)$/.exec(slot)
  return (m && list[Number(m[1])]) || fallback
}

type Phase = 'build' | 'saved'

function Island({ arrival }: { arrival: { kit: MegaThemeId; chosen: boolean } }) {
  const [draft, setDraft] = useState<BuilderDraft>(() => emptyDraft(arrival.kit, arrival.chosen))
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<Phase>('build')
  const [busyLine, setBusyLine] = useState<number | null>(null)
  const [err, setErr] = useState<StepError>(null)
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [now, setNow] = useState(0)
  const [resume, setResume] = useState<BuilderDraft | null>(null)
  const [pastHero, setPastHero] = useState(false)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [trapped, setTrapped] = useState(false)
  const [contentKey, setContentKey] = useState(0)

  const heroRef = useRef<HTMLElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const offerRef = useRef<HTMLTextAreaElement>(null)
  const contactRef = useRef<HTMLInputElement>(null)
  const morphRects = useRef<Record<string, DOMRect> | null>(null)
  const restored = useRef(false)
  // Once the draft has been handed to the launch it is not kept here any more.
  const sealed = useRef(false)
  const timers = useRef<{ toast?: number; save?: number; mock?: number; line?: number; focus?: number }>({})

  // ── The browser's own draft: read back once after mount (server markup is the cold render), kept on every change.
  useEffect(() => {
    try {
      const back = readStoredDraft((k) => window.localStorage.getItem(k), arrival.chosen ? arrival.kit : null)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser's own storage once, after hydration, is the only way to match the server markup
      if (back && hasProgress(back)) setResume(back)
    } catch { /* storage blocked: the page works without it */ }
    restored.current = true
  }, [arrival])

  useEffect(() => {
    if (!restored.current || sealed.current) return
    try { window.localStorage.setItem(DRAFT_KEY, serializeDraft(draft)) } catch { /* private window */ }
    if (!draft.name.trim()) return
    window.clearTimeout(timers.current.save)
    timers.current.save = window.setTimeout(() => setSaveState('saved'), 700)
  }, [draft])

  // ── The clock: counts from the first keystroke while building, every second.
  useEffect(() => {
    if (!draft.startedAt || phase !== 'build') return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [draft.startedAt, phase])

  // ── The dock shows once the hero has scrolled away.
  useEffect(() => {
    const el = heroRef.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setPastHero(e.intersectionRatio < 0.15 && e.boundingClientRect.top < 0), { threshold: [0, 0.15, 0.3] })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const t = timers.current
    return () => { window.clearTimeout(t.toast); window.clearTimeout(t.save); window.clearTimeout(t.mock); window.clearInterval(t.line); window.clearTimeout(t.focus) }
  }, [])

  // ── The morph: anything marked data-morph slides from where it was to where it is (FLIP), unless motion is reduced.
  const capture = () => {
    const root = heroRef.current
    if (!root) return
    const m: Record<string, DOMRect> = {}
    root.querySelectorAll<HTMLElement>('[data-morph]').forEach((el) => { m[el.dataset.morph ?? ''] = el.getBoundingClientRect() })
    morphRects.current = m
  }
  useLayoutEffect(() => {
    const old = morphRects.current
    morphRects.current = null
    const root = heroRef.current
    if (!old || !root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    root.querySelectorAll<HTMLElement>('[data-morph]').forEach((el) => {
      const key = el.dataset.morph ?? ''
      const o = old[key]
      if (!o || !el.animate) return
      const n = el.getBoundingClientRect()
      const dx = o.left - n.left
      const dy = o.top - n.top
      const sx = key === 'steps' && n.width ? o.width / n.width : 1
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01) return
      el.animate(
        [{ transformOrigin: '0 0', transform: `translate(${dx}px,${dy}px) scaleX(${sx})` }, { transformOrigin: '0 0', transform: 'translate(0,0) scaleX(1)' }],
        { duration: 800, easing: 'cubic-bezier(.2,.8,.2,1)' },
      )
    })
  })

  // ── Derived.
  const accents = kitAccents(draft.kit)
  const accent = accents[draft.accentAt] ?? accents[0]
  const kitLabel = PREVIEW_KITS.find((k) => k.id === draft.kit)?.label ?? draft.kit
  const tokens = previewTokens(draft.kit)
  const vars = { ...tokens, ...previewAccentVars(accent.fill, accent.text, !lightGround(tokens['--pv-bg'])) }
  const imagery = kitImagery(draft.kit)
  const building = phase === 'build'
  const hasName = draft.name.trim().length > 0
  const intro = building && step === 0 && !hasName
  const mode = intro ? 'intro' : 'building'
  const siteName = draft.name.trim() || 'Business Name'
  const handle = claimedHandle(draft)
  const status = useHandleStatus(handle, building && step === 0 && hasName)
  const site = deriveSite({
    name: draft.name, handle: handleOf(draft), hostName: draft.hostName, intents: draft.goals, kit: draft.kit,
    offer: draft.done.offer ? draft.offer : undefined, reach: { email: draft.email, phone: draft.phone, where: draft.where }, ghost: !draft.done.offer,
  })
  const coverSrc = slotSrc(draft.cover, imagery.covers, imagery.hero)
  const portraitSrc = slotSrc(draft.profile, imagery.portraits, imagery.portrait)
  const initial = (siteName[0] ?? 'Y').toUpperCase()
  const hostInitial = initialOf(draft.hostName, draft.name)
  const flags: Record<BuilderMove | 'launch', boolean> = { ...draft.done, launch: !building }
  const pct = progressOf(draft, !building)
  const started = hasName || step > 0 || !building
  const busy = busyLine !== null
  const mode3 = startingModeFor(draft.goals)
  const startedAt = draft.startedAt ? Date.parse(draft.startedAt) : NaN
  const endAt = building ? now : (draft.endedAt ? Date.parse(draft.endedAt) : now)
  const elapsedMs = Number.isFinite(startedAt) && now ? Math.max(0, endAt - startedAt) : 0
  const h1Lead = intro ? 'Your whole business,' : building ? 'Launch your business in ' : `${siteName}, saved in `
  const h1Time = intro ? '' : building ? formatClock(Math.max(0, CLOCK_BUDGET_MS - elapsedMs)) : `${formatClock(elapsedMs)}.`
  const sub = intro ? INTRO_SUB : building ? `Step ${step + 1} of 5 · ${stepPrompt(step, kitLabel)}` : `We sent your link to ${saved?.email ?? draft.email.trim()}. It stays a private draft until you open it.`
  const rowValue = [`${siteName} · /${handle || 'yourspace'}`, draft.offer.trim(), `${draft.hostName.trim()} · ${draft.email.trim()}`, `${kitLabel} photos for now`]
  const doneRows = building ? BUILDER_MOVES.map((k, i) => ({ k, i })).filter(({ k, i }) => draft.done[k] && i !== step) : []
  const saveLabel = saveState === 'saving' ? 'Saving' : 'Draft saved'
  const stepsHead = intro ? 'Five steps to live' : `${pct}% built`
  const chip = vars as CSSProperties

  // ── Moves.
  const flash = (text: string) => {
    window.clearTimeout(timers.current.toast)
    setToast((t) => ({ text, key: (t?.key ?? 0) + 1 }))
    timers.current.toast = window.setTimeout(() => setToast(null), TOAST_MS)
  }
  const edit = useCallback((fn: (d: BuilderDraft) => BuilderDraft) => {
    setDraft(fn)
    setSaveState('saving')
    setErr(null)
  }, [])
  const patch = (p: Partial<BuilderDraft>) => {
    if (typeof p.name === 'string' && building && step === 0 && hasName !== p.name.trim().length > 0) capture()
    edit((d) => ({ ...d, ...p, startedAt: d.startedAt ?? (typeof p.name === 'string' && p.name.trim() ? new Date().toISOString() : null) }))
  }
  const markDone = (move: BuilderMove, p?: Partial<BuilderDraft>) => edit((d) => ({ ...d, ...p, done: { ...d.done, [move]: true } }))
  const focusStep = (i: number) => {
    window.clearTimeout(timers.current.focus)
    timers.current.focus = window.setTimeout(() => { ([nameRef, offerRef, contactRef] as const)[i]?.current?.focus({ preventScroll: true }) }, 420)
  }
  const go = (i: number) => {
    capture()
    setStep(i)
    setPhase('build')
    setErr(null)
    focusStep(i)
  }
  const advance = (done: Record<BuilderMove, boolean>, from: number) => {
    capture()
    const n = nextOpenMove(done, from) ?? 4
    setStep(n)
    focusStep(n)
  }
  const mockUp = (offer: string) => {
    if (offer.trim().length < 6) { setErr('offer'); return }
    setErr(null)
    setBusyLine(0)
    window.clearInterval(timers.current.line)
    timers.current.line = window.setInterval(() => setBusyLine((l) => Math.min((l ?? 0) + 1, MOCKUP_LINES.length - 1)), MOCKUP_LINE_MS)
    const goals = intentsFromOffer(offer)
    timers.current.mock = window.setTimeout(() => {
      window.clearInterval(timers.current.line)
      const done = { ...draft.done, offer: true }
      markDone('offer', { offer, goals })
      setContentKey((k) => k + 1)
      setBusyLine(null)
      flash(`Mock-up ready. Switched on ${joinList(startingModeFor(goals).tools.map((t) => t.toLowerCase()))}`)
      advance(done, 1)
    }, MOCKUP_MIN_MS)
  }
  const next = () => {
    if (step === 0) {
      if (!hasName) { setErr('name'); return }
      if (!isHandleShape(handle) || status === 'taken') { setErr('slug'); return }
      if (!draft.accentPicked) { setErr('accent'); return }
      flash(`Name and ${accent.name} accent saved`)
      markDone('name')
      advance({ ...draft.done, name: true }, 0)
    } else if (step === 1) {
      mockUp(draft.offer)
    } else if (step === 2) {
      if (!draft.hostName.trim()) { setErr('fullName'); return }
      if (!EMAIL.test(draft.email.trim())) { setErr('email'); return }
      markDone('contact')
      flash('Contact section added.')
      advance({ ...draft.done, contact: true }, 2)
    } else if (step === 3) {
      markDone('photos')
      flash('Photos in place')
      advance({ ...draft.done, photos: true }, 3)
    }
  }
  const photosLater = () => {
    markDone('photos')
    flash(`Using ${kitLabel} photos for now. Swap them any time.`)
    advance({ ...draft.done, photos: true }, 3)
  }
  const onResume = () => {
    const d = resume
    if (!d) return
    capture()
    setResume(null)
    edit(() => ({ ...d, startedAt: new Date().toISOString(), endedAt: null }))
    const n = nextOpenMove(d.done, -1) ?? 4
    setStep(n)
    focusStep(n)
  }
  const handOver = () => {
    sealed.current = true
    try { window.localStorage.removeItem(DRAFT_KEY) } catch { /* nothing to clear */ }
  }
  const onSaved = (s: Saved) => {
    capture()
    setSaved(s)
    setPhase('saved')
    setDraft((d) => ({ ...d, endedAt: new Date().toISOString() }))
    flash(`/${handle} is saved as a draft`)
  }
  const toTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (building) focusStep(step)
  }

  return (
    <>
      <section ref={heroRef} id="get-started" className={HERO_CLASS[mode]} aria-labelledby="cs-h1" data-screen-label="01 Build your Space">
        <link rel="stylesheet" href={PREVIEW_FONT_SHEET} precedence="default" />
        <div className="fq-aura" aria-hidden="true" />
        <div className="fq-grain" aria-hidden="true" />
        <div className="cs-grid" data-mode={mode}>
          <div className="cs-top">
            <div className="cs-top-row">
              <span className="cs-eyebrow"><span className="cs-dot" />{kitLabel} theme</span>
              <Link className="cs-change" href="/themes">Change theme</Link>
              <div className="cs-badge">
                <span className="cs-dot" />
                <b>Draft</b>
                <span>Only you can see this</span>
              </div>
            </div>
            <h1 id="cs-h1" className="cs-h1" data-morph="h1">
              <span>{h1Lead}</span><em className="fq-iri-text">{h1Time}</em>
              {intro ? <span className="cs-sr"> live in 12 minutes.</span> : null}
            </h1>
          </div>

          <div className="cs-col">
            {intro ? <div className="cs-h1-line" aria-hidden="true">live in <em className="fq-iri-text">12 minutes.</em></div> : null}
            <p className="cs-sub" data-morph="sub" key={intro ? 'intro' : `s${step}${phase}`}>{sub}</p>
            {doneRows.length ? (
              <div className="cs-pills">
                {doneRows.map(({ k, i }) => {
                  const title = `${ROW_LABELS[i]}: ${rowValue[i]}. Click to edit.`
                  return (
                    <button key={k} type="button" className="cs-pill" data-morph={k} title={title} aria-label={title} onClick={() => go(i)}>
                      <span className="cs-pill-tick"><FqIcon name="check" size={12} /></span>
                      {ROW_LABELS[i]}
                      {i === 0 ? <span className="cs-pill-dot" style={{ background: accent.fill }} /> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}

            {building && step === 0 ? (
              <NameCard draft={draft} patch={patch} intro={intro} status={status} accents={accents} err={err} onNext={next} resumeName={resume?.name.trim() ?? ''} onResume={onResume} inputRef={nameRef} />
            ) : null}
            {building && step === 1 ? (
              <OfferCard draft={draft} patch={patch} busyLine={busyLine} err={err} onNext={next} onExample={(t) => { patch({ offer: t }); mockUp(t) }} inputRef={offerRef} />
            ) : null}
            {building && step === 2 ? <ContactCard draft={draft} patch={patch} err={err} onNext={next} inputRef={contactRef} onTrap={setTrapped} /> : null}
            {building && step === 3 ? (
              <PhotosCard draft={draft} patch={patch} imagery={imagery} vars={vars} siteName={siteName} initial={initial} hostInitial={hostInitial} onLater={photosLater} onNext={next} />
            ) : null}
            {building && step === 4 ? (
              <SaveCard draft={draft} handle={handle} siteName={siteName} kitLabel={kitLabel} coverSrc={coverSrc} trapped={trapped} onHandOver={handOver} onSaved={onSaved} onNeedEmail={() => { go(2); setErr('email') }} />
            ) : null}
            {!building && saved ? <SavedCard draft={draft} firstOffer={site.offers[0].t} tools={mode3.tools} saved={saved} trapped={trapped} /> : null}

            {intro ? <p className="cs-note" data-morph="note"><i />Free, no card. Build it first, save it last. It stays a private draft until you activate it.</p> : null}
          </div>

          <div className="cs-preview" data-morph="preview">
            <div className="cs-glow" aria-hidden="true" style={{ background: `radial-gradient(closest-side, ${accent.fill}, transparent)` }} />
            <SpacePreview
              kit={draft.kit}
              vars={vars}
              site={site}
              imagery={imagery}
              cover={coverSrc}
              portrait={portraitSrc}
              logo={draft.logo === 'mono' ? 'mono' : 'word'}
              profile={draft.profile === 'initials' ? 'initials' : 'photo'}
              initial={initial}
              hostInitial={hostInitial}
              ghost={!draft.done.offer}
              busy={busy}
              contentKey={contentKey}
              priority
            />
            {busy ? <div className="cs-mocking" style={chip}><span className="cs-dot fq-breathe" /><span>Mocking up your site</span></div> : null}
            {toast && !busy ? <div key={toast.key} className="cs-toast" role="status" aria-live="polite"><FqIcon name="check" size={15} /><span>{toast.text}</span></div> : null}
          </div>

          <div className="cs-steps" data-morph="steps">
            <div className="cs-steps-top">
              <span className="cs-steps-k">{stepsHead}</span>
              {started ? <span className="cs-save" data-state={saveState}><i />{saveLabel}</span> : null}
            </div>
            <div role="progressbar" aria-label="Your Space, built" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="cs-segs">
              {STEP_SEGMENTS.map((seg, i) => {
                const key = (i < 4 ? BUILDER_MOVES[i] : 'launch') as BuilderMove | 'launch'
                const done = flags[key]
                const isNow = building && i === step
                const label = `${seg.label}${done ? ' · edit' : ''}`
                return (
                  <button key={seg.label} type="button" className="cs-seg" data-state={done ? 'done' : isNow ? 'now' : undefined} title={label} aria-label={label} onClick={() => { if (done || isNow) go(i) }}>
                    <span className="cs-seg-bar" />
                    <span className="cs-seg-l">{seg.short}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {started && pastHero ? (
        <div className="cs-dock">
          <div className="cs-dock-in">
            <span className="cs-dock-thumb"><Image src={coverSrc} alt="" fill sizes="42px" style={{ objectFit: 'cover' }} /></span>
            <span className="cs-dock-text"><b>{siteName}</b><span>{building ? `${pct}% built · still a draft` : 'Saved · still a draft'}</span></span>
            {!building && saved?.keepBuildingHref ? (
              <Link className="fq-iri-btn cs-dock-go" href={saved.keepBuildingHref}>Keep building<FqIcon name="arrow" size={16} /></Link>
            ) : (
              <button type="button" className="fq-iri-btn cs-dock-go" onClick={toTop}>Finish my launch<FqIcon name="arrow" size={16} /></button>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}

function FromUrl() {
  const arrival = arrivalFromParam(useSearchParams().get('kit'))
  return <Island key={`${arrival.kit}:${arrival.chosen}`} arrival={arrival} />
}

export function CreateSpaceStudio() {
  return (
    <Suspense fallback={<Island arrival={arrivalFromParam(null)} />}>
      <FromUrl />
    </Suspense>
  )
}
