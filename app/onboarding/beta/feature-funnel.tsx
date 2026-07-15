'use client'

// FEATURE FUNNEL — the playable front door (ADR-619, docs/SPLASH-FUNNELS.md Phase 3).
// A visitor USES one stripped feature before they ever sign up. Five cards, but unlike the cinematic
// induction the demo IS the hero: card 2 runs the real box-breath visualizer, and at the first hold
// a "keep your streak, free" panel breathes in while the ring keeps going. The reward beat shows the
// true first-log outcome (a Day 1 streak + Zaps landing) so the signup ask reads as "claim what you
// just started", not "give us your email". Completion reuses the tested deferred-induction pipeline.
//
// Voice canon (docs/CONTENT-VOICE.md): plain sentences, proper nouns carry the magic, never narrate
// the reader's feelings, no em dashes. The reward is SHOWN as stats (chips), never pitched as "earn N".

import { useEffect, useRef, useState } from 'react'
import { BreathVisualizer } from '@/components/on-air/visualizer'
import { patternBySlug } from '@/lib/on-air'
import type { FeatureFunnelConfig, FunnelDestination } from '@/lib/onboarding/beta-sequences'
import { isSafeInAppPath } from '@/lib/onboarding/funnel-destination'
import { WizardProgress } from '@/components/templates'
import { trackClient } from '@/components/analytics/track-provider'
import { beginFeatureFunnelSignup } from './feature-actions'
import { signInWithMagicLink, signInWithGoogle } from '@/app/sign-in/actions'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The box cycle is 16s (In-4 / Hold-4 / Out-4 / Hold-4). The capture panel arrives at the first hold
// (~8s in), and the reward chips light once a full round completes (~16s).
const CAPTURE_AT_SEC = 8
const REWARD_AT_SEC = 16

type Lead = { name: string; email: string }

export default function FeatureFunnel({
  sequence,
  feature,
  destination,
  deferred = false,
  userEmail = '',
  headline,
  intro,
}: {
  sequence: string
  feature: FeatureFunnelConfig
  destination?: FunnelDestination
  /** Signed-out visitor: the whole point of a feature funnel. Signed-in = just plays the demo. */
  deferred?: boolean
  userEmail?: string
  /** Card-1 hero copy (from the sequence splash), with sensible breathwork defaults. */
  headline?: string
  intro?: string
}) {
  const [step, setStep] = useState(1)
  const [lead, setLead] = useState<Lead>({ name: '', email: userEmail })
  const pattern = patternBySlug(feature.pattern ?? 'box')
  const zaps = feature.zapsReward ?? 12

  // Fire the funnel-entered event once per session (Phase 1 stats: entered -> captured -> signed-up).
  const entered = useRef(false)
  useEffect(() => {
    if (entered.current) return
    entered.current = true
    try {
      const key = `fq_funnel_entered_${sequence}`
      if (!sessionStorage.getItem(key)) {
        trackClient('onboarding.funnel_entered', { seq: sequence, style: 'feature' })
        sessionStorage.setItem(key, '1')
      }
    } catch {
      trackClient('onboarding.funnel_entered', { seq: sequence, style: 'feature' })
    }
  }, [sequence])

  const total = 5
  const labels = ['Meet the breath', 'Try a round', 'Log it', 'Keep it', 'Step in']

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-6 py-10">
      <span className="brandmark mb-8 block h-8 aspect-[963/170]" aria-hidden />

      <div className="relative z-10 w-full max-w-md">
        {step === 1 && (
          <IntroCard
            headline={headline ?? 'Box breathing, in one round.'}
            intro={
              intro ??
              'Four counts in, hold four, four out, hold four. Follow the ring with your eyes half closed. That is the whole practice.'
            }
            onStart={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <DemoCard
            pattern={pattern}
            zaps={zaps}
            initialLead={lead}
            onCapture={(l) => {
              setLead(l)
              trackClient('onboarding.funnel_captured', { seq: sequence, style: 'feature' })
              setStep(3)
            }}
            onSkip={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <ValueCard
            eyebrow="Every round counts"
            title="It logs itself."
            body="Each round you take gets logged the moment you finish. No form, no fuss. Your streak counts the days you show up."
            visual={<StreakStrip active={1} />}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && (
          <ValueCard
            eyebrow="All in one place"
            title="Your practice, kept."
            body="Rounds, minutes, patterns tried, Zaps banked. It stays yours, so a good streak is something you can see grow."
            visual={<VaultStrip zaps={zaps} />}
            onNext={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}

        {step === 5 && (
          <StepInCard
            sequence={sequence}
            destination={destination}
            deferred={deferred}
            lead={lead}
            zaps={zaps}
          />
        )}
      </div>

      <div className="relative z-10 mt-10 w-full max-w-md">
        <WizardProgress current={step} total={total} label={labels[step - 1]} variant="dots" />
      </div>
    </main>
  )
}

// ── Card 1: intro ────────────────────────────────────────────────────────────────────────────────
function IntroCard({ headline, intro, onStart }: { headline: string; intro: string; onStart: () => void }) {
  return (
    <div className="text-center">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-primary">Breathwork</p>
      <h1 className="font-display text-3xl uppercase leading-[0.95] text-balance text-text sm:text-4xl">{headline}</h1>
      <p className="mx-auto mt-5 max-w-sm text-base leading-relaxed text-muted">{intro}</p>
      <button
        type="button"
        onClick={onStart}
        className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        Try a round
      </button>
    </div>
  )
}

// ── Card 2: live demo + capture ────────────────────────────────────────────────────────────────────
function DemoCard({
  pattern,
  zaps,
  initialLead,
  onCapture,
  onSkip,
}: {
  pattern: ReturnType<typeof patternBySlug>
  zaps: number
  initialLead: Lead
  onCapture: (l: Lead) => void
  onSkip: () => void
}) {
  // One shared clock for the visualizer and the beat timing.
  const [startedAt] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [name, setName] = useState(initialLead.name)
  const [email, setEmail] = useState(initialLead.email)

  useEffect(() => {
    const id = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250)
    return () => clearInterval(id)
  }, [startedAt])

  const showCapture = elapsed >= CAPTURE_AT_SEC
  const rewarded = elapsed >= REWARD_AT_SEC
  const emailOk = EMAIL_RE.test(email.trim())

  return (
    <div className="text-center">
      <div className="mx-auto flex h-64 w-64 items-center justify-center">
        <BreathVisualizer pattern={pattern} startedAt={startedAt} />
      </div>

      {!showCapture && (
        <p className="mt-4 text-sm text-muted" aria-live="polite">
          Follow the ring. In as it grows, out as it settles.
        </p>
      )}

      {showCapture && (
        <div className="mt-5 rounded-2xl border border-border bg-surface-elevated p-5 text-left shadow-sm">
          {rewarded ? (
            <>
              <div className="mb-3 flex items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-3 py-1 text-sm font-semibold text-primary-strong">
                  <span aria-hidden>🔥</span> Day 1
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-broadcast-bg px-3 py-1 text-sm font-semibold text-broadcast-strong">
                  <span aria-hidden>⚡</span> {zaps} Zaps
                </span>
              </div>
              <p className="text-center text-base font-semibold text-text">You started a streak.</p>
              <p className="mt-1 text-center text-sm text-muted">Create your account to keep it going. Free.</p>
            </>
          ) : (
            <>
              <p className="text-center text-base font-semibold text-text">You are starting a streak.</p>
              <p className="mt-1 text-center text-sm text-muted">
                Finish the round and it is yours. Create your account to keep it, free.
              </p>
            </>
          )}

          <div className="mt-4 space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              className="w-full rounded-lg border border-border bg-canvas px-3 py-2.5 text-sm text-text outline-none placeholder:text-subtle focus:border-primary"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              inputMode="email"
              className="w-full rounded-lg border border-border bg-canvas px-3 py-2.5 text-sm text-text outline-none placeholder:text-subtle focus:border-primary"
            />
          </div>

          <button
            type="button"
            disabled={!emailOk}
            onClick={() => onCapture({ name: name.trim(), email: email.trim() })}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Keep my streak
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="mt-2 block w-full text-center text-xs text-subtle underline-offset-2 hover:underline"
          >
            Just keep breathing
          </button>
        </div>
      )}
    </div>
  )
}

// ── Cards 3 + 4: value ─────────────────────────────────────────────────────────────────────────────
function ValueCard({
  eyebrow,
  title,
  body,
  visual,
  onNext,
  onBack,
}: {
  eyebrow: string
  title: string
  body: string
  visual: React.ReactNode
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="text-center">
      <div className="mb-6">{visual}</div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-primary">{eyebrow}</p>
      <h2 className="font-display text-2xl uppercase leading-tight text-text sm:text-3xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-muted">{body}</p>
      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex flex-1 items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex flex-[2] items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Next
        </button>
      </div>
    </div>
  )
}

/** A seven-day streak strip, the first day lit — the "it logs itself" visual. */
function StreakStrip({ active }: { active: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold ${
            i < active ? 'bg-primary text-on-primary' : 'border border-border text-subtle'
          }`}
        >
          {i < active ? '🔥' : i + 1}
        </div>
      ))}
    </div>
  )
}

/** A tiny "vault" of what a first round banks — the "kept in one place" visual. */
function VaultStrip({ zaps }: { zaps: number }) {
  return (
    <div className="mx-auto flex max-w-xs items-center justify-center gap-3">
      <div className="flex-1 rounded-xl border border-border bg-surface-elevated px-3 py-3 text-center">
        <p className="text-lg font-bold text-text">🔥 1</p>
        <p className="text-xs text-muted">day streak</p>
      </div>
      <div className="flex-1 rounded-xl border border-border bg-surface-elevated px-3 py-3 text-center">
        <p className="text-lg font-bold text-text">⚡ {zaps}</p>
        <p className="text-xs text-muted">Zaps</p>
      </div>
      <div className="flex-1 rounded-xl border border-border bg-surface-elevated px-3 py-3 text-center">
        <p className="text-lg font-bold text-text">1</p>
        <p className="text-xs text-muted">round</p>
      </div>
    </div>
  )
}

// ── Card 5: step in (create the account) ──────────────────────────────────────────────────────────
function StepInCard({
  sequence,
  destination,
  deferred,
  lead,
  zaps,
}: {
  sequence: string
  destination?: FunnelDestination
  deferred: boolean
  lead: Lead
  zaps: number
}) {
  const [name, setName] = useState(lead.name)
  const [email, setEmail] = useState(lead.email)
  const [signingIn, setSigningIn] = useState(false)
  const emailOk = EMAIL_RE.test(email.trim())

  const completeNext =
    destination?.mode === 'direct' && isSafeInAppPath(destination.url)
      ? `/onboarding/beta/complete?to=${encodeURIComponent(destination.url)}`
      : '/onboarding/beta/complete'

  async function withStash(): Promise<void> {
    await beginFeatureFunnelSignup({ name: name.trim(), email: email.trim(), seq: sequence })
  }

  async function magicLink() {
    if (!emailOk || signingIn) return
    setSigningIn(true)
    await withStash()
    const fd = new FormData()
    fd.set('email', email.trim())
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

  // A signed-in visitor already has an account — just point them at the real practice.
  if (!deferred) {
    const to = destination?.mode === 'direct' && isSafeInAppPath(destination.url) ? destination.url : '/feed'
    return (
      <div className="text-center">
        <span className="mx-auto mb-4 block text-4xl" aria-hidden>🔥</span>
        <h2 className="font-display text-2xl uppercase leading-tight text-text sm:text-3xl">You are in.</h2>
        <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-muted">
          Take your first real round and your streak starts for keeps.
        </p>
        <a
          href={to}
          className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Start breathing
        </a>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="mb-4 flex items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-3 py-1 text-sm font-semibold text-primary-strong">
          <span aria-hidden>🔥</span> Day 1
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-broadcast-bg px-3 py-1 text-sm font-semibold text-broadcast-strong">
          <span aria-hidden>⚡</span> {zaps} Zaps
        </span>
      </div>
      <h2 className="font-display text-2xl uppercase leading-tight text-text sm:text-3xl">Claim your streak.</h2>
      <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-muted">
        Your first round is saved. Create your account to keep it and log every one after.
      </p>

      <div className="mt-6 space-y-2 text-left">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          className="w-full rounded-lg border border-border bg-canvas px-3 py-2.5 text-sm text-text outline-none placeholder:text-subtle focus:border-primary"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          autoComplete="email"
          inputMode="email"
          className="w-full rounded-lg border border-border bg-canvas px-3 py-2.5 text-sm text-text outline-none placeholder:text-subtle focus:border-primary"
        />
      </div>

      <button
        type="button"
        onClick={google}
        disabled={signingIn}
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        Continue with Google
      </button>
      <button
        type="button"
        onClick={magicLink}
        disabled={!emailOk || signingIn}
        className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
      >
        Email me a sign-in link
      </button>
    </div>
  )
}
