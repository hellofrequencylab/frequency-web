'use client'

// FEATURE FUNNEL — the playable front door (ADR-619, docs/SPLASH-FUNNELS.md Phase 3).
//
// FRAMING (owner directive): this is a LEAD INTO THE BETA LAUNCH. It is an INVITATION, not a plain
// signup. The free breathwork timer is the hook; the frame throughout is "you are invited into the
// Frequency beta". Keep the invitation language front and center in any copy edit here.
//
// A visitor USES one stripped feature before they ever sign up. Styled to match the cinematic beta
// induction (warm light, brandmark on top, big font-display headings, progress at the bottom) so it
// reads as a real page, not a mobile app in a box. Three beats:
//   1. Demo — a phone mockup runs the real box-breath timer (a 5s countdown, then the ring), with the
//      coaching beside it. At the first hold a "Keep going" nudge + "Get a Free Timer" reveals name +
//      email (auto-saved). A quiet Skip sits under it.
//   2. Reward — the true first-log outcome (Day 1 streak + the 25-Zap welcome), and "claim your
//      @username" (a live-checked handle). Skip under it.
//   3. Join — create the account with everything they gave us pre-filled + a photo, "Join now, get 25
//      Zaps". Loss aversion: they are keeping the streak they already started.
// Back steps between beats. Completion reuses the tested deferred-induction pipeline.
//
// Voice canon (docs/CONTENT-VOICE.md): plain sentences, proper nouns carry the magic, never narrate
// the reader's feelings, no em dashes. The reward is SHOWN as stat chips, never pitched as "earn N".

import { useEffect, useRef, useState } from 'react'
import { BreathVisualizer } from '@/components/on-air/visualizer'
import { LotusIcon } from '@/components/on-air/icons'
import { patternBySlug } from '@/lib/on-air'
import type { FeatureFunnelConfig, FunnelDestination } from '@/lib/onboarding/beta-sequences'
import { isSafeInAppPath } from '@/lib/onboarding/funnel-destination'
import { WizardProgress } from '@/components/templates'
import { trackClient } from '@/components/analytics/track-provider'
import { downscaleImageFile } from '@/lib/images/downscale-image'
import { beginFeatureFunnelSignup } from './feature-actions'
import { signInWithMagicLink, signInWithGoogle } from '@/app/sign-in/actions'

// Avatar is too big for a cookie, so the deferred flow parks it in localStorage and
// /onboarding/beta/complete uploads it. Same key the finalizer reads.
const PENDING_AVATAR_KEY = 'fq_pending_avatar'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HANDLE_RE = /^[a-z0-9_]{3,30}$/

// The demo timer runs as a real 5-minute Mindless session (the counter reads 5:00 and ticks down).
const SESSION_SEC = 5 * 60
// The box cycle is In-4 / Hold-4 / Out-4 / Hold-4. The "Keep going" nudge lands at the first hold, so
// after the inhale: 4s of breath elapsed.
const HOLD_AT_SEC = 4

function mmss(total: number): string {
  const t = Math.max(0, Math.floor(total))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

type Lead = { name: string; email: string; handle: string }

// Shared warm-light field style (matches the induction's inputs).
const FIELD =
  'w-full rounded-xl border border-border bg-canvas px-4 py-3 text-base text-text placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none'
const PRIMARY_BTN =
  'inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50'
const GHOST_BTN =
  'inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50'

export default function FeatureFunnel({
  sequence,
  feature,
  destination,
  deferred = false,
  userEmail = '',
}: {
  sequence: string
  feature: FeatureFunnelConfig
  destination?: FunnelDestination
  /** Signed-out visitor: the whole point of a feature funnel. Signed-in = just plays the demo. */
  deferred?: boolean
  userEmail?: string
}) {
  const [step, setStep] = useState(1)
  const [lead, setLead] = useState<Lead>({ name: '', email: userEmail, handle: '' })
  const pattern = patternBySlug(feature.pattern ?? 'box')
  const zaps = feature.zapsReward ?? 25

  // Auto-save: hydrate the lead from localStorage on mount, then persist every change, so a refresh
  // or a step back never loses what they typed.
  const storeKey = `fq_ff_lead_${sequence}`
  const hydrated = useRef(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey)
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Lead>
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLead((l) => ({ ...l, ...saved, email: saved.email || l.email }))
      }
    } catch {
      // ignore a malformed cache
    }
    hydrated.current = true
  }, [storeKey])
  useEffect(() => {
    if (!hydrated.current) return
    try {
      localStorage.setItem(storeKey, JSON.stringify(lead))
    } catch {
      // storage full / disabled — the flow still works in-memory
    }
  }, [lead, storeKey])

  // Fire funnel-entered once per session (Phase 1 stats: entered -> captured -> signed-up).
  const entered = useRef(false)
  useEffect(() => {
    if (entered.current) return
    entered.current = true
    try {
      const key = `fq_funnel_entered_${sequence}`
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // fall through and still record it
    }
    trackClient('onboarding.funnel_entered', { seq: sequence, style: 'feature' })
  }, [sequence])

  const total = 3
  const labels = ['Try the timer', 'Your streak', 'Join']

  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas">
      <div className="amber-glow pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <span className="brandmark mb-8 block h-10 aspect-[963/170]" aria-hidden />

        <div className="w-full max-w-4xl">
          {step === 1 && (
            <DemoStep
              pattern={pattern}
              lead={lead}
              resumed={!!lead.email}
              onLead={setLead}
              onCaptured={() => trackClient('onboarding.funnel_captured', { seq: sequence, style: 'feature' })}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <RewardStep
              zaps={zaps}
              lead={lead}
              onLead={setLead}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <JoinStep
              sequence={sequence}
              destination={destination}
              deferred={deferred}
              lead={lead}
              onLead={setLead}
              zaps={zaps}
              onBack={() => setStep(2)}
            />
          )}
        </div>

        <div className="mt-10 w-full max-w-xs">
          <WizardProgress current={step} total={total} label={labels[step - 1]} variant="dots" />
        </div>
      </div>
    </main>
  )
}

// ── The phone mockup ───────────────────────────────────────────────────────────────────────────────
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto aspect-[9/19] w-56 rounded-[2.75rem] border-[10px] border-text bg-text shadow-2xl sm:w-64">
      {/* notch */}
      <div className="absolute left-1/2 top-0 z-20 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-text" aria-hidden />
      {/* screen — kept light + subtle, like the real Mindless timer on canvas (owner: no dark overlay) */}
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[2rem] bg-canvas">
        <div className="amber-glow pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative z-10 flex w-full items-center justify-center px-3">{children}</div>
      </div>
    </div>
  )
}

// The Mindless timer screen, replicated (owner: "look exactly the same as the Mindless timer"). The
// lotus + MINDLESS wordmark, the breath ring, and a mm:ss read-out counting down from 5:00.
function TimerScreen({
  pattern,
  startedAt,
  remaining,
  compact = false,
}: {
  pattern: ReturnType<typeof patternBySlug>
  startedAt: number
  remaining: number
  compact?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="flex animate-pulse items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-primary-strong [animation-duration:3s]">
        <LotusIcon className={compact ? 'h-4 w-4' : 'h-[18px] w-[18px]'} /> Mindless
      </p>
      <div className={compact ? 'scale-[0.5]' : 'scale-[0.62]'}>
        <BreathVisualizer pattern={pattern} startedAt={startedAt} />
      </div>
      <p className={`${compact ? '-mt-6 text-lg' : '-mt-8 text-2xl'} font-semibold tabular-nums text-text/70`}>
        {mmss(remaining)} <span className="text-xs font-normal text-subtle">left</span>
      </p>
      <p className="text-xs tabular-nums text-subtle">5 min session</p>
    </div>
  )
}

// ── Beat 1: the playable demo ───────────────────────────────────────────────────────────────────────
function DemoStep({
  pattern,
  lead,
  resumed,
  onLead,
  onCaptured,
  onNext,
}: {
  pattern: ReturnType<typeof patternBySlug>
  lead: Lead
  /** They have already played once (came back a step) — skip the countdown, open the fields. */
  resumed: boolean
  onLead: (next: Lead) => void
  onCaptured: () => void
  onNext: () => void
}) {
  // One session clock. Set on mount (Date.now is not allowed in render). elapsed drives the breath
  // ring, the mm:ss read-out (5:00 down), and the first-hold nudge.
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [showFields, setShowFields] = useState(resumed)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStartedAt(Date.now())
  }, [])
  useEffect(() => {
    if (startedAt === null) return
    const id = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250)
    return () => clearInterval(id)
  }, [startedAt])

  const remaining = SESSION_SEC - elapsed
  const nudge = resumed || elapsed >= HOLD_AT_SEC
  const emailOk = EMAIL_RE.test(lead.email.trim())

  function proceed() {
    if (emailOk) onCaptured()
    onNext()
  }

  const timer = startedAt !== null && <TimerScreen pattern={pattern} startedAt={startedAt} remaining={remaining} />
  const timerCompact = startedAt !== null && (
    <TimerScreen pattern={pattern} startedAt={startedAt} remaining={remaining} compact />
  )

  const coaching = (
    <div className="text-center md:text-left">
      <span className="mb-3 inline-block animate-wiggle rounded-full bg-primary px-3 py-1 text-2xs font-bold uppercase tracking-[0.3em] text-on-primary shadow-sm shadow-primary/25">
        Beta Launch
      </span>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-primary">Free breathwork timer</p>
      <h1 className="font-display text-3xl uppercase leading-[0.95] text-balance text-text sm:text-5xl">
        Breathe with the ring.
      </h1>

      {!nudge && (
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted md:mx-0 md:text-lg">
          In as it grows. Hold at the top. Out as it settles. Let your shoulders drop.
        </p>
      )}

      {nudge && !showFields && (
        <div className="mt-4">
          <p className="text-lg font-semibold text-text">Keep going. You are doing it.</p>
          <p className="mx-auto mt-1 max-w-md text-base text-muted md:mx-0">
            This timer is your invitation into the Frequency beta. Grab it and your streak starts today.
          </p>
          <button type="button" onClick={() => setShowFields(true)} className={`${PRIMARY_BTN} mt-4 sm:w-auto sm:px-6`}>
            Get a Free Timer
          </button>
        </div>
      )}

      {showFields && (
        <div className="mx-auto mt-4 max-w-sm md:mx-0">
          <p className="text-base font-semibold text-text">Where should we send your invitation?</p>
          <div className="mt-3 space-y-2 text-left">
            <input
              type="text"
              value={lead.name}
              onChange={(e) => onLead({ ...lead, name: e.target.value })}
              placeholder="Your name"
              autoComplete="name"
              className={FIELD}
            />
            <input
              type="email"
              value={lead.email}
              onChange={(e) => onLead({ ...lead, email: e.target.value })}
              placeholder="you@email.com"
              autoComplete="email"
              inputMode="email"
              className={FIELD}
            />
          </div>
          <button type="button" onClick={proceed} disabled={!emailOk} className={`${PRIMARY_BTN} mt-3`}>
            Keep my timer
          </button>
          <button type="button" onClick={onNext} className="mt-2 block w-full text-center text-xs text-subtle hover:underline">
            Skip for now
          </button>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Mobile: no phone mockup. The page IS the timer — a compact ring up top, then the coaching +
          fields, kept tight so name/email sit above the fold. Scrolls only if it has to. */}
      <div className="md:hidden">
        <div className="mb-5 flex justify-center">{timerCompact}</div>
        {coaching}
      </div>

      {/* Desktop: the phone mockup, sitting close to the coaching on the right. */}
      <div className="hidden items-center gap-6 md:grid md:grid-cols-[auto_minmax(0,1fr)] lg:gap-10">
        <PhoneFrame>{timer}</PhoneFrame>
        {coaching}
      </div>
    </>
  )
}

// ── Beat 2: the reward + username ────────────────────────────────────────────────────────────────────
function RewardStep({
  zaps,
  lead,
  onLead,
  onBack,
  onNext,
}: {
  zaps: number
  lead: Lead
  onLead: (next: Lead) => void
  onBack: () => void
  onNext: () => void
}) {
  const [handle, setHandle] = useState(lead.handle)
  const [check, setCheck] = useState<{ handle: string; status: 'idle' | 'checking' | 'available' | 'taken' }>({
    handle: '',
    status: 'idle',
  })

  // Debounced availability check (the public /api/check-handle RPC works signed-out).
  useEffect(() => {
    const h = handle.trim().toLowerCase()
    if (!HANDLE_RE.test(h)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheck({ handle: h, status: 'idle' })
      return
    }
    setCheck({ handle: h, status: 'checking' })
    let cancelled = false
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-handle?handle=${encodeURIComponent(h)}`)
        const { available } = (await res.json()) as { available: boolean }
        if (!cancelled) setCheck({ handle: h, status: available ? 'available' : 'taken' })
      } catch {
        if (!cancelled) setCheck({ handle: h, status: 'idle' })
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [handle])

  function proceed() {
    onLead({ ...lead, handle: handle.trim().toLowerCase() })
    onNext()
  }

  return (
    <div className="mx-auto max-w-lg text-center">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-primary">Nice work</p>
      <h1 className="font-display text-4xl uppercase leading-[0.95] text-balance text-text sm:text-5xl">
        You started a streak.
      </h1>

      {/* The true first-log outcome, shown as stats. */}
      <div className="mx-auto mt-7 grid max-w-md grid-cols-3 gap-3">
        <Stat big="🔥 1" small="day streak" />
        <Stat big={`⚡ ${zaps}`} small="Zaps waiting" />
        <Stat big="1" small="round logged" />
      </div>

      <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-muted">
        You are on the list for the Frequency beta, where this becomes a whole practice with real
        people. Keep showing up and the streak grows. First, claim your name so it is yours.
      </p>

      {/* Claim the @username. */}
      <div className="mx-auto mt-5 max-w-sm text-left">
        <label className="mb-1 block text-xs font-semibold text-subtle">Your @username</label>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-canvas px-3 focus-within:border-border-strong">
          <span className="text-base text-subtle">@</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="yourname"
            autoComplete="off"
            className="w-full bg-transparent py-3 text-base text-text placeholder:text-subtle focus:outline-none"
          />
          {check.status === 'available' && check.handle === handle.trim().toLowerCase() && (
            <span className="text-xs font-semibold text-success">free</span>
          )}
          {check.status === 'taken' && check.handle === handle.trim().toLowerCase() && (
            <span className="text-xs font-semibold text-warning">taken</span>
          )}
        </div>
      </div>

      <div className="mx-auto mt-6 flex max-w-sm items-center gap-3">
        <button type="button" onClick={onBack} className={`${GHOST_BTN} flex-1`}>
          Back
        </button>
        <button type="button" onClick={proceed} className={`${PRIMARY_BTN} flex-[2]`}>
          Continue
        </button>
      </div>
      <button type="button" onClick={onNext} className="mt-2 block w-full text-center text-xs text-subtle hover:underline">
        Skip for now
      </button>
    </div>
  )
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-3 py-4 shadow-sm">
      <p className="text-2xl font-bold text-text">{big}</p>
      <p className="mt-0.5 text-xs text-muted">{small}</p>
    </div>
  )
}

// ── Beat 3: join ──────────────────────────────────────────────────────────────────────────────────
function JoinStep({
  sequence,
  destination,
  deferred,
  lead,
  onLead,
  zaps,
  onBack,
}: {
  sequence: string
  destination?: FunnelDestination
  deferred: boolean
  lead: Lead
  onLead: (next: Lead) => void
  zaps: number
  onBack: () => void
}) {
  const [signingIn, setSigningIn] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const emailOk = EMAIL_RE.test(lead.email.trim())

  const completeNext =
    destination?.mode === 'direct' && isSafeInAppPath(destination.url)
      ? `/onboarding/beta/complete?to=${encodeURIComponent(destination.url)}`
      : '/onboarding/beta/complete'

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressed = await downscaleImageFile(file)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = reject
        r.readAsDataURL(compressed)
      })
      setAvatar(dataUrl)
      localStorage.setItem(PENDING_AVATAR_KEY, dataUrl) // the finalizer uploads it after sign-in
    } catch {
      // best-effort — they can add a photo later from their profile
    }
  }

  async function withStash() {
    await beginFeatureFunnelSignup({
      name: lead.name.trim(),
      email: lead.email.trim(),
      seq: sequence,
      handle: lead.handle.trim(),
    })
  }
  async function magicLink() {
    if (!emailOk || signingIn) return
    setSigningIn(true)
    await withStash()
    const fd = new FormData()
    fd.set('email', lead.email.trim())
    fd.set('next', completeNext)
    await signInWithMagicLink(fd)
  }
  async function google() {
    if (signingIn) return
    setSigningIn(true)
    await withStash()
    const fd = new FormData()
    fd.set('next', completeNext)
    await signInWithGoogle(fd)
  }

  // Signed-in visitor already has an account — send them to breathe for real.
  if (!deferred) {
    const to = destination?.mode === 'direct' && isSafeInAppPath(destination.url) ? destination.url : '/feed'
    return (
      <div className="mx-auto max-w-lg text-center">
        <span className="mx-auto mb-4 block text-4xl" aria-hidden>🔥</span>
        <h1 className="font-display text-4xl uppercase leading-[0.95] text-text sm:text-5xl">You are in.</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted">
          Take your first real round and your streak starts for keeps.
        </p>
        <a href={to} className={`${PRIMARY_BTN} mx-auto mt-8 max-w-xs`}>Start breathing</a>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg text-center">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-primary">You are invited</p>
      <div className="mb-4 flex items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-3 py-1 text-sm font-semibold text-primary-strong">
          <span aria-hidden>🔥</span> Day 1
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-broadcast-bg px-3 py-1 text-sm font-semibold text-broadcast-strong">
          <span aria-hidden>⚡</span> {zaps} Zaps
        </span>
      </div>
      <h1 className="font-display text-4xl uppercase leading-[0.95] text-balance text-text sm:text-5xl">
        Join the Frequency beta.
      </h1>
      <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted">
        Accept your invitation to keep the Day 1 streak and {zaps} Zaps you just started, and step into the
        beta with real people and real practice.
      </p>

      {/* Photo + prefilled details */}
      <div className="mx-auto mt-6 max-w-sm text-left">
        <div className="mb-3 flex items-center gap-3">
          <label className="group relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-primary-bg text-primary-strong">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs font-semibold">Photo</span>
            )}
            <input type="file" accept="image/*" onChange={onPickPhoto} className="sr-only" />
          </label>
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={lead.name}
              onChange={(e) => onLead({ ...lead, name: e.target.value })}
              placeholder="Your name"
              autoComplete="name"
              className={FIELD}
            />
          </div>
        </div>
        {lead.handle && <p className="mb-3 text-sm text-muted">You are <span className="font-semibold text-text">@{lead.handle}</span></p>}
        <input
          type="email"
          value={lead.email}
          onChange={(e) => onLead({ ...lead, email: e.target.value })}
          placeholder="you@email.com"
          autoComplete="email"
          inputMode="email"
          className={FIELD}
        />
      </div>

      <div className="mx-auto mt-5 max-w-sm">
        <button type="button" onClick={google} disabled={signingIn} className={PRIMARY_BTN}>
          Join now, get {zaps} Zaps
        </button>
        <button type="button" onClick={magicLink} disabled={!emailOk || signingIn} className={`${GHOST_BTN} mt-2 w-full`}>
          Email me a sign-in link
        </button>
        <button type="button" onClick={onBack} className="mt-3 block w-full text-center text-xs text-subtle hover:underline">
          Back
        </button>
      </div>
    </div>
  )
}
