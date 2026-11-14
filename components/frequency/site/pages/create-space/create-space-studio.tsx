'use client'

// /create-a-space, the client island: one hero that is the whole builder (docs/design-systems/create-a-space,
// README section 2). The H1 starts as the promise and becomes the clock; the step cards come and go in the left
// column while the preview on the right fills in; saved steps collapse to pills; the steps bar reads "built", never
// "live". One state object feeds all of it. The kit arrives as ?kit=<MegaThemeId> from the Theme Kit pages; no param
// starts on the house look. Server markup is the cold-traffic render (the intro), so the page reads without script.
// The draft lives in the visitor's own browser, and from step 3 (an address) also on the server (ADR-1933): every
// change after that is sent, debounced, to saveDraftLead, the tab's last changes go by beacon on pagehide, and a
// ?draft= link reads it back as a "Welcome back" the visitor picks up. The hand-over is create-space-claim.tsx.
// Styles: create-space.css.
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { restoreDraft, saveBuilderProgress, saveDraftLead } from '@/app/(marketing)/create-a-space/actions'
import { SaveCard, SavedCard } from '@/components/frequency/site/pages/create-space/create-space-claim'
import type { Saved } from '@/components/frequency/site/pages/create-space/create-space-claim'
import { LookRows } from '@/components/frequency/site/pages/create-space/create-space-look'
import { PhotosCard } from '@/components/frequency/site/pages/create-space/create-space-photos'
import type { UploadUrls } from '@/components/frequency/site/pages/create-space/create-space-photos'
import { ContactCard, MOCKUP_LINES, NameCard, OFFER_EXAMPLES, OfferCard } from '@/components/frequency/site/pages/create-space/create-space-steps'
import type { StepError } from '@/components/frequency/site/pages/create-space/create-space-steps'
import { SpacePreview } from '@/components/frequency/site/pages/create-space/space-preview'
import { useHandleStatus } from '@/components/frequency/site/pages/create-space/use-handle-status'
import {
  BUILDER_MOVES, DRAFT_KEY, STEP_SEGMENTS, claimedHandle, emptyDraft, handleOf, hasProgress, initialOf, nextOpenMove, parseDraft, progressOf,
  readStoredDraft, serializeDraft, startingModeFor, stepPrompt,
} from '@/lib/create-space/builder'
import type { BuilderDraft, BuilderMove } from '@/lib/create-space/builder'
import { doorArrival } from '@/lib/create-space/door'
import { lastAccentAt, lastKitFrom, rememberAccent, rememberKit } from '@/lib/create-space/last-kit'
import type { MegaThemeId } from '@/lib/theme/mega-theme'
import type { DoorArrival } from '@/lib/create-space/door'
import { isHandleShape } from '@/lib/create-space/handle'
import { intentsFromOffer } from '@/lib/create-space/intents-from-offer'
import { browserZone, leadEmailOf } from '@/lib/create-space/lead'
import { SIGNAL_URL, visitorKeyFrom } from '@/lib/create-space/signal'
import type { CreateSpaceSignal } from '@/lib/create-space/signal'
import { PREVIEW_KITS, deriveSite, joinList, kitAccents, kitImagery } from '@/lib/create-space/preview-site'
import { acceptUpload, getUploads, putUpload } from '@/lib/create-space/uploads'
import type { UploadKind } from '@/lib/create-space/uploads'
import { parseWizardResume, type WizardResume } from '@/lib/launch/wizard-resume'
import { CLOCK_BUDGET_MS, formatClock } from '@/lib/launch/clock'
import { PREVIEW_FONT_SHEET, previewAccentVars, previewTokens } from '@/lib/theme/preview-tokens'
import './create-space.css'
import './create-space-themes.css'

/** The hero wears its mode as a class too, so a probe and a test can read it off the markup. */
const HERO_CLASS = { intro: 'cs-hero cs-hero-intro', building: 'cs-hero cs-hero-building' } as const
const ROW_LABELS = ['Name', 'Offer', 'Contact', 'Photos'] as const
/** The intro H1 as one sentence, the one lib/seo/frequency-pages.ts pins as the page's headline. It renders in two
 *  pieces (the lead inside the h1, the clause read to a screen reader there and drawn on its own line beside it), so
 *  the sentence lives here whole and the pieces are cut from it. */
const INTRO_H1 = 'Your whole business, live in 12 minutes.'
const INTRO_H1_CLAUSE = 'live in 12 minutes.'
const INTRO_H1_LEAD = INTRO_H1.slice(0, -(INTRO_H1_CLAUSE.length + 1))
const INTRO_SUB = 'You have a practice, a studio, a gathering or a group, and the tools are scattered. Build one home for all of it: your website, Spotlight, bookings and people.'
/** The mock-up moment is never shorter than this, so the lines are read, not flashed. */
const MOCKUP_MIN_MS = 2600
const MOCKUP_LINE_MS = 600
const TOAST_MS = 3200
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** How long after the last change the draft goes to the server (ADR-1933). */
const SERVER_SAVE_MS = 1500
/** Where the tab's last changes go on pagehide (app/api/create-space/draft/route.ts). */
const BEACON_URL = '/api/create-space/draft'
const RESUME_KEY = 'fq-wizard-resume-v1'

const lightGround = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16)
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) > 0.4
}

/** A kit slot (s0, s1...) to its picture, `up` to their own when the browser still has it, else the kit's own. */
const slotSrc = (slot: string, list: readonly string[], fallback: string, own?: string) => {
  if (slot === 'up' && own) return own
  const m = /^s(\d)$/.exec(slot)
  return (m && list[Number(m[1])]) || fallback
}

type Phase = 'build' | 'saved'

function Island({ arrival, draftToken, initialResume = null, timedEntry = false }: { arrival: DoorArrival; draftToken: string | null; initialResume?: WizardResume | null; timedEntry?: boolean }) {
  // A door's hints (lib/create-space/door.ts) prime the start: the name is typed in, the goals light the preview's
  // offer cards before a sentence is written, and the niche rides to the launch. Nothing is marked done for them.
  // The accent picked beside the kit's Use button arrives picked: they chose it there, so it is not asked again.
  const [draft, setDraft] = useState<BuilderDraft>(() => initialResume?.draft ?? ({
    ...emptyDraft(arrival.kit, arrival.chosen), name: arrival.name, goals: arrival.goals, niche: arrival.niche,
    ...(arrival.accentAt !== undefined ? { accentAt: arrival.accentAt, accentPicked: true } : {}),
  }))
  const [step, setStep] = useState(initialResume?.draft ? initialResume.cursor : 0)
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
  const [uploads, setUploads] = useState<UploadUrls>({})
  const [uploadError, setUploadError] = useState<string | null>(null)
  /** The address the server holds the draft under, once it does. */
  const [savedTo, setSavedTo] = useState<string | null>(null)

  const heroRef = useRef<HTMLElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const offerRef = useRef<HTMLTextAreaElement>(null)
  const contactRef = useRef<HTMLInputElement>(null)
  const morphRects = useRef<Record<string, DOMRect> | null>(null)
  const restored = useRef(false)
  const awaitingResume = useRef(false)
  const resumeCursor = useRef<number | null>(initialResume?.cursor ?? null)
  const [timed, setTimed] = useState(initialResume?.timedEntry ?? timedEntry)
  const pendingProgress = useRef<WizardResume | null>(null)
  const savingProgress = useRef(false)
  const flushProgress = useCallback(async () => {
    if (savingProgress.current) return
    savingProgress.current = true
    try {
      while (pendingProgress.current) {
        const value = pendingProgress.current
        pendingProgress.current = null
        await saveBuilderProgress(value)
      }
    } catch { /* local draft remains available for another save */ }
    finally { savingProgress.current = false }
  }, [])
  // Once the draft has been handed to the launch it is not kept here any more.
  const sealed = useRef(false)
  const timers = useRef<{ toast?: number; save?: number; mock?: number; line?: number; focus?: number; server?: number }>({})
  // The server save reads the latest draft from here, so a debounced timer and the pagehide beacon never send stale state.
  const latest = useRef(draft)
  const trappedRef = useRef(false)
  const ownRef = useRef(false)
  /** The draft as last sent to the server (its token left out), so a token write-back does not send it again. */
  const lastSent = useRef('')
  /** The tab's own key for the funnel signals (lib/create-space/signal.ts): minted on the first signal, never a cookie. */
  const visitor = useRef<string | null>(null)

  // ── The funnel signals (LIVE-1970): nine closed events, no typed text, one per tab and event. A count, never a blocker.
  const signal = useCallback((event: CreateSpaceSignal, props: Record<string, string | number | boolean> = {}) => {
    try {
      visitor.current ??= visitorKeyFrom(window.sessionStorage, () => crypto.randomUUID())
      void fetch(SIGNAL_URL, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ v: visitor.current, event, props }) }).catch(() => {})
    } catch { /* no fetch, no storage: the page is still the page */ }
  }, [])

  // ── The browser's own draft: read back once after mount (server markup is the cold render), kept on every change.
  useEffect(() => {
    try {
      const shared = parseWizardResume(JSON.parse(window.localStorage.getItem(RESUME_KEY) ?? 'null'))
      resumeCursor.current = initialResume?.cursor ?? shared?.cursor ?? null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the browser clock opt-in after hydration alongside its draft
      if (!initialResume && shared) setTimed(shared.timedEntry)
      const back = initialResume?.draft ? null : readStoredDraft((k) => window.localStorage.getItem(k), arrival.chosen ? arrival.kit : null)
      if (back && hasProgress(back)) { awaitingResume.current = true; setResume(back) }
    } catch { /* storage blocked: the page works without it */ }
    restored.current = true
    signal('createspace.view', { kit: arrival.kit, chosen: arrival.chosen })
  }, [arrival, signal, initialResume])

  // ── A ?draft= link: the server copy comes back as a "Welcome back", never restored by itself (ADR-1933).
  useEffect(() => {
    if (!draftToken) return
    let live = true
    restoreDraft(draftToken).then(({ draft: json }) => {
      if (!live || !json) return
      const back = parseDraft(json, null)
      if (back && hasProgress(back)) { awaitingResume.current = true; setResume(back) }
    }).catch(() => { /* the link opened nothing: the page is still the page */ })
    return () => { live = false }
  }, [draftToken])

  useEffect(() => {
    if (!restored.current || sealed.current || awaitingResume.current || resume) return
    try { window.localStorage.setItem(DRAFT_KEY, serializeDraft(draft)) } catch { /* private window */ }
    if (!draft.name.trim()) return
    window.clearTimeout(timers.current.save)
    timers.current.save = window.setTimeout(() => setSaveState('saved'), 700)
  }, [draft, resume])

  useEffect(() => {
    if (!restored.current || sealed.current || awaitingResume.current || resume || (!draft.name && step === 0 && !draft.kitChosen)) return
    const value = parseWizardResume({ version: 1, phase: 'builder', cursor: step, theme: draft.kit,
      accentAt: draft.accentAt, niche: draft.niche, goals: draft.goals, timedEntry: timed,
      draft, leadToken: draft.leadToken })
    if (!value) return
    try { window.localStorage.setItem(RESUME_KEY, JSON.stringify(value)) } catch { /* private window */ }
    pendingProgress.current = value
    const timer = window.setTimeout(() => { void flushProgress() }, 350)
    return () => window.clearTimeout(timer)
  }, [draft, step, resume, flushProgress, timed])

  // ── The moment a name and a full address are typed, the draft also goes to the server (the owner's rule, 2026-11-03:
  // capture before Save, so an abandoned draft gets its come-back email): debounced after every change, and by beacon
  // when the tab goes. Not gated on the contact step's Continue.
  const flashRef = useRef<((text: string) => void) | null>(null)
  /** The contact step was just finished: the next successful server save says so in its toast. */
  const contactToast = useRef(false)
  const sendable = (d: BuilderDraft) => Boolean(leadEmailOf(d) && d.name.trim()) && !trappedRef.current && !sealed.current
  const fingerprint = (d: BuilderDraft) => serializeDraft({ ...d, leadToken: null })
  const sendToServer = useCallback(async () => {
    const d = latest.current
    if (!sendable(d) || fingerprint(d) === lastSent.current) return
    lastSent.current = fingerprint(d)
    const form = new FormData()
    form.set('draft', serializeDraft(d))
    if (d.leadToken) form.set('token', d.leadToken)
    const tz = browserZone()
    if (tz) form.set('tz', tz)
    if (ownRef.current) form.set('own', '1')
    setSaveState('saving')
    const r = await saveDraftLead(form).catch(() => ({ ok: false as const }))
    if (!r.ok) { lastSent.current = ''; setSaveState('saved'); return }
    setSavedTo(leadEmailOf(d))
    setSaveState('saved')
    if (contactToast.current) { contactToast.current = false; flashRef.current?.('Contact section added. Draft saved to your email.') }
    if (r.token !== d.leadToken) setDraft((cur) => ({ ...cur, leadToken: r.token }))
    if (r.handleTaken) { setErr('slug'); flashRef.current?.('That handle was just taken. Pick another.') }
  }, [])
  useEffect(() => {
    if (!restored.current || !sendable(draft)) return
    window.clearTimeout(timers.current.server)
    timers.current.server = window.setTimeout(() => { void sendToServer() }, SERVER_SAVE_MS)
  }, [draft, sendToServer])
  useEffect(() => {
    const flush = () => {
      const d = latest.current
      if (!sendable(d) || fingerprint(d) === lastSent.current || !('sendBeacon' in navigator)) return
      lastSent.current = fingerprint(d)
      const body = JSON.stringify({ draft: serializeDraft(d), token: d.leadToken, tz: browserZone(), own: ownRef.current ? 1 : 0 })
      navigator.sendBeacon(BEACON_URL, new Blob([body], { type: 'application/json' }))
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  // ── Their own pictures, kept in IndexedDB between visits; object URLs for this one.
  useEffect(() => {
    let live = true
    const made: string[] = []
    getUploads().then((files) => {
      if (!live) return
      const urls: UploadUrls = {}
      for (const [kind, blob] of Object.entries(files)) { const u = URL.createObjectURL(blob); made.push(u); urls[kind as UploadKind] = u }
      if (made.length) setUploads(urls)
    })
    return () => { live = false; made.forEach((u) => URL.revokeObjectURL(u)) }
  }, [])

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
    return () => { window.clearTimeout(t.toast); window.clearTimeout(t.save); window.clearTimeout(t.mock); window.clearInterval(t.line); window.clearTimeout(t.focus); window.clearTimeout(t.server) }
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
  const imagery = kitImagery(draft.kit, draft.accentAt)
  const building = phase === 'build'
  const hasName = draft.name.trim().length > 0
  const intro = building && step === 0 && !hasName
  const mode = intro ? 'intro' : 'building'
  const siteName = draft.name.trim() || 'Business Name'
  const handle = claimedHandle(draft)
  const status = useHandleStatus(handle, building && step === 0 && hasName)
  const site = deriveSite({
    name: draft.name, handle: handleOf(draft), hostName: draft.hostName, intents: draft.goals, kit: draft.kit, accentAt: draft.accentAt,
    offer: draft.done.offer ? draft.offer : undefined, reach: { email: draft.email, phone: draft.phone, where: draft.where }, ghost: !draft.done.offer,
  })
  const coverSrc = slotSrc(draft.cover, imagery.covers, imagery.hero, uploads.cover)
  const portraitSrc = slotSrc(draft.profile, imagery.portraits, imagery.portrait, uploads.profile)
  const ownCount = [draft.cover === 'up' && uploads.cover, draft.logo === 'up' && uploads.logo, draft.profile === 'up' && uploads.profile].filter(Boolean).length
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
  const showClock = timed && elapsedMs < CLOCK_BUDGET_MS
  const h1Lead = intro ? INTRO_H1_LEAD : building && showClock ? 'Launch your business in ' : !building && timed ? `${siteName}, saved in ` : siteName
  const h1Time = intro || !timed || (building && !showClock) ? '' : building ? formatClock(Math.max(0, CLOCK_BUDGET_MS - elapsedMs)) : `${formatClock(elapsedMs)}.`
  const sub = intro ? INTRO_SUB : building ? `Step ${step + 1} of 5 · ${stepPrompt(step, kitLabel)}` : `We sent your link to ${saved?.email ?? draft.email.trim()}. It stays a private draft until you open it.`
  const rowValue = [`${siteName} · /${handle || 'yourspace'}`, draft.offer.trim(), `${draft.hostName.trim()} · ${draft.email.trim()}`, ownCount ? `${ownCount} of yours, the rest from ${kitLabel}` : `${kitLabel} photos for now`]
  const doneRows = building ? BUILDER_MOVES.map((k, i) => ({ k, i })).filter(({ k, i }) => draft.done[k] && i !== step) : []
  const saveLabel = saveState === 'saving' ? 'Saving' : savedTo ? `Saved to ${savedTo}` : 'Draft saved'
  const stepsHead = intro ? 'Five steps to live' : `${pct}% built`
  const chip = vars as CSSProperties

  // ── Moves.
  const flash = (text: string) => {
    window.clearTimeout(timers.current.toast)
    setToast((t) => ({ text, key: (t?.key ?? 0) + 1 }))
    timers.current.toast = window.setTimeout(() => setToast(null), TOAST_MS)
  }
  // What the server save and the beacon read at their own time: the latest of these, after each render.
  useEffect(() => { latest.current = draft; trappedRef.current = trapped; ownRef.current = ownCount > 0; flashRef.current = flash })
  const edit = useCallback((fn: (d: BuilderDraft) => BuilderDraft) => {
    setDraft(fn)
    setSaveState('saving')
    setErr(null)
  }, [])
  const patch = (p: Partial<BuilderDraft>) => {
    if (typeof p.name === 'string' && building && step === 0 && hasName !== p.name.trim().length > 0) capture()
    if (!draft.startedAt && typeof p.name === 'string' && p.name.trim()) signal('createspace.name_started')
    if (p.accentPicked === true) signal('createspace.accent_picked', { accent: p.accentAt ?? draft.accentAt })
    edit((d) => ({ ...d, ...p, startedAt: d.startedAt ?? (typeof p.name === 'string' && p.name.trim() ? new Date().toISOString() : null) }))
  }
  /** Whole seconds since the first letter, for the step signal, off the clock's own tick; 0 before a name or a tick. */
  const secondsIn = () => (draft.startedAt && now ? Math.max(0, Math.min(86_400, Math.round((now - Date.parse(draft.startedAt)) / 1000))) : 0)
  const markDone = (move: BuilderMove, p?: Partial<BuilderDraft>) => {
    signal('createspace.step_done', { step: move, seconds: secondsIn() })
    if (move === 'photos') signal('createspace.photos', { uploaded: ownCount > 0, kept_theme: ownCount === 0 })
    edit((d) => ({ ...d, ...p, done: { ...d.done, [move]: true } }))
  }
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
    signal('createspace.offer', { example_used: (OFFER_EXAMPLES as readonly string[]).includes(offer.trim()), intents: goals.join(',') })
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
      flash(`Name and ${accent.name} accent saved`)
      markDone('name')
      advance({ ...draft.done, name: true }, 0)
    } else if (step === 1) {
      mockUp(draft.offer)
    } else if (step === 2) {
      if (!draft.hostName.trim()) { setErr('fullName'); return }
      if (!EMAIL.test(draft.email.trim())) { setErr('email'); return }
      signal('createspace.lead', { has_phone: draft.phone.trim().length > 0, has_where: draft.where.trim().length > 0 })
      markDone('contact')
      // The toast names the save once the server has it (sendToServer); until then only the step is announced.
      contactToast.current = true
      flash('Contact section added.')
      advance({ ...draft.done, contact: true }, 2)
    } else if (step === 3) {
      markDone('photos')
      flash('Photos in place')
      advance({ ...draft.done, photos: true }, 3)
    }
  }
  const onUpload = (kind: UploadKind, file: File) => {
    const why = acceptUpload(file)
    if (why) { setUploadError(why); return }
    setUploadError(null)
    const url = URL.createObjectURL(file)
    setUploads((u) => { if (u[kind]) URL.revokeObjectURL(u[kind]) ; return { ...u, [kind]: url } })
    patch({ [kind]: 'up' } as Partial<BuilderDraft>)
    void putUpload(kind, file)
  }
  const photosLater = () => {
    markDone('photos')
    flash(`Using ${kitLabel} photos for now. Swap them any time.`)
    advance({ ...draft.done, photos: true }, 3)
  }
  // The look rows: a pick is remembered in the browser, so the next visit starts on it (lib/create-space/last-kit.ts).
  const onKit = (id: MegaThemeId) => {
    if (id === draft.kit) return
    rememberKit(id)
    const at = lastAccentAt(id, document.cookie) ?? 0
    patch({ kit: id, kitChosen: true, accentAt: at })
    signal('createspace.view', { kit: id, chosen: true })
  }
  const onAccent = (at: number) => {
    const a = accents[at]
    if (!a) return
    rememberAccent(a.name)
    patch({ accentAt: at, accentPicked: true })
  }
  const onResume = () => {
    const d = resume
    if (!d) return
    capture()
    signal('createspace.resume', { source: draftToken ? 'email' : 'local' })
    awaitingResume.current = false
    setResume(null)
    edit(() => ({ ...d, endedAt: null }))
    const n = resumeCursor.current ?? nextOpenMove(d.done, -1) ?? 4
    setStep(n)
    focusStep(n)
  }
  const handOver = () => {
    sealed.current = true
    try { window.localStorage.removeItem(DRAFT_KEY); window.localStorage.removeItem(RESUME_KEY) } catch { /* nothing to clear */ }
  }
  const onSaved = (s: Saved) => {
    capture()
    setSaved(s)
    setPhase('saved')
    setDraft((d) => ({ ...d, endedAt: new Date().toISOString() }))
    flash(`/${handle} is saved as a draft`)
  }
  const toTop = () => {
    signal('createspace.dock_click')
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
              <LookRows kits={PREVIEW_KITS} kit={draft.kit} accents={accents} accentAt={draft.accentAt} onKit={onKit} onAccent={onAccent} />
              <div className="cs-badge">
                <span className="cs-dot" />
                <b>Draft</b>
                <span>Only you can see this</span>
              </div>
            </div>
            <h1 id="cs-h1" className="cs-h1" data-morph="h1">
              <span>{h1Lead}</span><em className="fq-iri-text">{h1Time}</em>
              {intro ? <span className="cs-sr"> {INTRO_H1_CLAUSE}</span> : null}
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
              <NameCard draft={draft} patch={patch} intro={intro} status={status} err={err} onNext={next} resumeName={resume?.name.trim() ?? ''} onResume={onResume} inputRef={nameRef} />
            ) : null}
            {building && step === 1 ? (
              <OfferCard draft={draft} patch={patch} busyLine={busyLine} err={err} onNext={next} onExample={(t) => { patch({ offer: t }); mockUp(t) }} inputRef={offerRef} />
            ) : null}
            {building && step === 2 ? <ContactCard draft={draft} patch={patch} err={err} onNext={next} inputRef={contactRef} onTrap={setTrapped} /> : null}
            {building && step === 3 ? (
              <PhotosCard draft={draft} patch={patch} imagery={imagery} vars={vars} siteName={siteName} initial={initial} hostInitial={hostInitial} uploads={uploads} onUpload={onUpload} uploadError={uploadError} onLater={photosLater} onNext={next} />
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
              logo={draft.logo === 'up' && uploads.logo ? { src: uploads.logo } : draft.logo === 'mono' ? 'mono' : 'word'}
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
              <span role="progressbar" aria-label="Your Space, built" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="cs-steps-k">{stepsHead}</span>
              {started ? <span className="cs-save" data-state={saveState}><i />{saveLabel}</span> : null}
            </div>
            {/* The progressbar is the "built" reading, not the segments: the segments are buttons that reopen a step, and a
                control inside a progressbar is a nested interactive (axe, LIVE-1978). */}
            <div role="group" aria-label="Steps" className="cs-segs">
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
            <span className="cs-dock-thumb"><Image src={coverSrc} alt="" fill sizes="42px" unoptimized={coverSrc.startsWith('blob:')} style={{ objectFit: 'cover' }} /></span>
            <span className="cs-dock-text"><b>{siteName}</b><span>{building ? `${pct}% built · still a draft` : 'Saved · still a draft'}</span></span>
            {!building && saved?.keepBuildingHref ? (
              <Link className="fq-iri-btn cs-dock-go" href={saved.keepBuildingHref} onClick={() => signal('createspace.dock_click')}>Keep building<FqIcon name="arrow" size={16} /></Link>
            ) : (
              <button type="button" className="fq-iri-btn cs-dock-go" onClick={toTop}>Finish my launch<FqIcon name="arrow" size={16} /></button>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}

const noopSubscribe = () => () => {}

/** The cookie string as it was when the page first read it. Read once so a pick made in the builder (which writes the
 *  same cookies) never changes the arrival and remounts the island under the visitor's hands. */
let bootCookie: string | undefined
const firstCookie = () => (bootCookie ??= document.cookie)

function FromUrl({ initialResume }: { initialResume: WizardResume | null }) {
  const params = useSearchParams()
  const asked = doorArrival((k) => params.get(k))
  // No kit in the address: start on the one they last looked at or last picked here (lib/create-space/last-kit.ts), with
  // the accent they last picked. Read after mount, because this page is static. An explicit ?kit= wins, and so does ?accent=.
  const cookie = useSyncExternalStore(noopSubscribe, firstCookie, () => null as string | null)
  const last = lastKitFrom(cookie)
  const kit = asked.chosen ? asked.kit : last ?? asked.kit
  const accentAt = asked.accentAt ?? (cookie ? lastAccentAt(kit, cookie) ?? undefined : undefined)
  const arrival = { ...asked, kit, chosen: asked.chosen || !!last, ...(accentAt !== undefined ? { accentAt } : {}) }
  return <Island key={`${arrival.kit}:${arrival.chosen}:${arrival.accentAt ?? ''}:${arrival.name}:${arrival.goals.join()}:${arrival.niche ?? ''}`} arrival={arrival} draftToken={params.get('draft')} initialResume={initialResume} timedEntry={params.get('timer') === '12' || params.get('entry') === '12-minutes'} />
}

export function CreateSpaceStudio({ initialResume = null }: { initialResume?: WizardResume | null }) {
  return (
    <Suspense fallback={<Island arrival={doorArrival(() => null)} draftToken={null} />}>
      <FromUrl initialResume={initialResume} />
    </Suspense>
  )
}
