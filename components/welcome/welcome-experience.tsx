'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useSpring, useMotionTemplate } from 'motion/react'
import { ArrowRight, Check, Camera } from 'lucide-react'
import { useTypewriter } from './use-typewriter'
import { STEPS, REVEAL_STEPS, fillTemplate, type Step } from './steps'

const HERO_IMG = '/images/site/lab-thermal.jpg'
const HERO_BG = `linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0.5), rgba(0,0,0,0.85)), url(${HERO_IMG})`
const EASE_TEAR = [0.7, 0, 0.3, 1] as const

// The real website revealed behind the conversation. `/` renders the live
// marketing home for signed-out visitors, and server-redirects a signed-in
// viewer straight to their real /feed — so what assembles from the interior out
// is the actual product, not a mock. (Once the funnel authenticates inline, this
// can point at /feed to reveal the member's brand-new feed.)
const REVEAL_URL = '/'

type Phase = 'tear' | 'welcome' | 'convo'
type Answers = Record<string, unknown>

const clamp = (n: number, lo = 12, hi = 88) => Math.min(hi, Math.max(lo, n))

export function WelcomeExperience() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('tear')
  const [split, setSplit] = useState(50)

  const [stepIdx, setStepIdx] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [revealDone, setRevealDone] = useState(0)

  // Reveal mask: a sand sheet with a hole in the centre that widens as the
  // funnel progresses — the world assembling from the interior out. A soft,
  // low-stiffness spring so each step opens slowly rather than snapping.
  const radius = useSpring(0, { stiffness: 16, damping: 26, mass: 1.1 })
  const [fullR, setFullR] = useState(1400)
  const mask = useMotionTemplate`radial-gradient(circle at 50% 50%, transparent ${radius}px, #000 calc(${radius}px + 1px))`

  // Startup choreography: read where they tore the page, then sequence the
  // panels apart -> the word "welcome" -> the conversation. All async so no
  // setState runs synchronously inside the effect.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem('freq-tear-y') : null
      if (raw) setSplit(clamp(parseFloat(raw)))
      setFullR(Math.hypot(window.innerWidth, window.innerHeight))
    }, 0))
    timers.push(setTimeout(() => setPhase('welcome'), 1150))
    timers.push(setTimeout(() => setPhase('convo'), 2550))
    const onResize = () => setFullR(Math.hypot(window.innerWidth, window.innerHeight))
    window.addEventListener('resize', onResize)
    return () => { timers.forEach(clearTimeout); window.removeEventListener('resize', onResize) }
  }, [])

  // Drive the hole toward the progress target whenever it changes.
  useEffect(() => {
    const seed = phase === 'convo' ? 180 : 0
    radius.set(seed + (revealDone / REVEAL_STEPS) * (fullR - seed))
  }, [revealDone, fullR, phase, radius])

  const step = STEPS[stepIdx]
  const atEnd = stepIdx >= STEPS.length - 1

  function advance() {
    if (!atEnd) setStepIdx((i) => i + 1)
  }
  function commit(field: string, value: unknown) {
    setAnswers((a) => ({ ...a, [field]: value }))
    setRevealDone((n) => n + 1)
    advance()
  }
  function finish() {
    router.push('/feed')
  }

  const showTear = phase !== 'convo'

  return (
    <div className="fixed inset-0 overflow-hidden bg-marketing-canvas">
      {/* The real website being revealed, behind everything. Non-interactive: a
          living backdrop, not a place to click. */}
      <iframe
        src={REVEAL_URL}
        title="Frequency"
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full border-0"
      />

      {/* Sand sheet with the widening hole */}
      <motion.div
        className="absolute inset-0 z-10 bg-marketing-canvas"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      />

      {/* The conversation, always on solid sand at the centre */}
      <div className="absolute inset-0 z-30 flex items-center justify-center px-5">
        <AnimatePresence mode="wait">
          {phase === 'welcome' && (
            <motion.h1
              key="welcome-word"
              initial={{ opacity: 0, y: 8, letterSpacing: '0.4em' }}
              animate={{ opacity: 1, y: 0, letterSpacing: '0.18em' }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="font-display text-4xl uppercase tracking-wide text-text sm:text-6xl"
            >
              welcome
            </motion.h1>
          )}

          {phase === 'convo' && (
            <motion.div
              key="card"
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="w-full max-w-md rounded-[2rem] border border-border/70 bg-marketing-canvas/95 p-7 shadow-[0_24px_80px_-24px_rgba(42,27,6,0.45)] backdrop-blur-sm sm:p-9"
            >
              <ConversationCard
                key={step.id}
                step={step}
                answers={answers}
                onCommit={commit}
                onFinish={finish}
              />
              <ProgressDots total={REVEAL_STEPS} done={revealDone} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The torn splash panels, on top until they finish pulling apart */}
      <AnimatePresence>
        {showTear && (
          <>
            <motion.div
              key="tear-top"
              className="absolute inset-x-0 top-0 z-50 overflow-hidden"
              style={{ height: `${split}vh` }}
              initial={{ y: 0 }}
              animate={{ y: '-100%' }}
              exit={{ y: '-100%' }}
              transition={{ duration: 0.9, delay: 0.18, ease: EASE_TEAR }}
            >
              <div className="absolute inset-x-0 top-0 h-screen bg-cover bg-center" style={{ backgroundImage: HERO_BG }} />
              <div className="absolute inset-x-0 bottom-0 h-px bg-primary/40" />
            </motion.div>
            <motion.div
              key="tear-bottom"
              className="absolute inset-x-0 bottom-0 z-50 overflow-hidden"
              style={{ height: `${100 - split}vh` }}
              initial={{ y: 0 }}
              animate={{ y: '100%' }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.9, delay: 0.18, ease: EASE_TEAR }}
            >
              <div className="absolute inset-x-0 bottom-0 h-screen bg-cover bg-center" style={{ backgroundImage: HERO_BG }} />
              <div className="absolute inset-x-0 top-0 h-px bg-primary/40" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function ProgressDots({ total, done }: { total: number; done: number }) {
  return (
    <div className="mt-7 flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-500 ${
            i < done ? 'w-5 bg-primary' : 'w-1.5 bg-border-strong'
          }`}
        />
      ))}
    </div>
  )
}

// ── One conversational beat ─────────────────────────────────────────────────
// Re-keyed per step, so the typewriter and any local input state reset cleanly.

function ConversationCard({
  step, answers, onCommit, onFinish,
}: {
  step: Step
  answers: Answers
  onCommit: (field: string, value: unknown) => void
  onFinish: () => void
}) {
  const isReveal = step.kind === 'reveal'
  // Quiet statement line(s) first, then the question — typed as one stream.
  const statement = (!isReveal && 'statement' in step && step.statement) ? step.statement : []
  const lines = useMemo(() => {
    if (isReveal) return [fillTemplate(step.headline, answers)]
    return [...statement, step.prompt].map((l) => fillTemplate(l, answers))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, answers])

  const { shown, done, skip } = useTypewriter(lines)
  const statementCount = statement.length

  const Prompt = (
    <div className="min-h-[3.5rem]" onClick={() => !done && skip()}>
      {shown.map((line, i) => {
        const isStatement = !isReveal && i < statementCount
        return (
          <p
            key={i}
            className={
              isReveal
                ? 'font-display text-3xl uppercase tracking-wide text-text'
                : isStatement
                  ? 'text-base leading-relaxed text-muted'
                  : 'mt-1.5 text-lg font-semibold leading-snug text-text'
            }
          >
            {line}
            {!done && i === shown.length - 1 && <Caret />}
          </p>
        )
      })}
    </div>
  )

  return (
    <div>
      {Prompt}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="mt-5"
          >
            <StepControl step={step} answers={answers} onCommit={onCommit} onFinish={onFinish} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Caret() {
  return <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-pulse bg-primary align-middle" />
}

// ── The right input for each step kind ──────────────────────────────────────

function StepControl({
  step, answers, onCommit, onFinish,
}: {
  step: Step
  answers: Answers
  onCommit: (field: string, value: unknown) => void
  onFinish: () => void
}) {
  switch (step.kind) {
    case 'choice':
      return (
        <div className="grid gap-2">
          {step.choices.map((c) => (
            <button
              key={c.value}
              onClick={() => onCommit(step.field, c.value)}
              className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm font-medium text-text shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
            >
              {c.label}
              <ArrowRight className="h-4 w-4 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )
    case 'text':
      return <SingleLine field={step.field} placeholder={step.placeholder} maxLength={step.maxLength} onCommit={onCommit} />
    case 'handle':
      return <HandleInput field={step.field} onCommit={onCommit} />
    case 'longtext':
      return <MultiLine field={step.field} placeholder={step.placeholder} optional={step.optional} maxLength={step.maxLength} onCommit={onCommit} />
    case 'avatar':
      return <AvatarPick field={step.field} onCommit={onCommit} />
    case 'interests':
      return <InterestPick step={step} onCommit={onCommit} />
    case 'email':
      return <EmailInput field={step.field} onCommit={onCommit} />
    case 'otp':
      return <OtpInput field={step.field} onCommit={onCommit} />
    case 'reveal':
      return (
        <div>
          <p className="text-base text-muted">{fillTemplate(step.sub, answers)}</p>
          <PrimaryButton onClick={onFinish} className="mt-5 w-full justify-center">
            Step inside <ArrowRight className="h-4 w-4" />
          </PrimaryButton>
        </div>
      )
    default:
      return null
  }
}

function PrimaryButton({
  children, onClick, disabled, className = '',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-hover hover:shadow-md enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text outline-none transition-colors placeholder:text-subtle focus:border-primary'

function SingleLine({
  field, placeholder, maxLength, onCommit,
}: { field: string; placeholder: string; maxLength?: number; onCommit: (f: string, v: unknown) => void }) {
  const [value, setValue] = useState('')
  const ok = value.trim().length > 0
  const submit = () => ok && onCommit(field, value.trim())
  return (
    <div className="space-y-3">
      <input
        autoFocus
        className={inputClass}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <PrimaryButton onClick={submit} disabled={!ok} className="w-full justify-center">
        Continue <ArrowRight className="h-4 w-4" />
      </PrimaryButton>
    </div>
  )
}

const HANDLE_RE = /[^a-z0-9_]/g
function HandleInput({ field, onCommit }: { field: string; onCommit: (f: string, v: unknown) => void }) {
  const [value, setValue] = useState('')
  const ok = value.length >= 3
  const submit = () => ok && onCommit(field, value)
  return (
    <div className="space-y-3">
      <div className="flex items-center rounded-xl border border-border bg-surface px-4 focus-within:border-primary">
        <span className="text-base font-semibold text-subtle">@</span>
        <input
          autoFocus
          className="w-full bg-transparent px-1 py-3 text-base text-text outline-none placeholder:text-subtle"
          placeholder="handle"
          value={value}
          maxLength={30}
          onChange={(e) => setValue(e.target.value.toLowerCase().replace(HANDLE_RE, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {ok && <Check className="h-4 w-4 text-success" />}
      </div>
      <PrimaryButton onClick={submit} disabled={!ok} className="w-full justify-center">
        Continue <ArrowRight className="h-4 w-4" />
      </PrimaryButton>
    </div>
  )
}

function MultiLine({
  field, placeholder, optional, maxLength, onCommit,
}: { field: string; placeholder: string; optional?: boolean; maxLength?: number; onCommit: (f: string, v: unknown) => void }) {
  const [value, setValue] = useState('')
  const ok = value.trim().length > 0
  return (
    <div className="space-y-3">
      <textarea
        autoFocus
        rows={2}
        maxLength={maxLength}
        className={`${inputClass} resize-none`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <PrimaryButton onClick={() => onCommit(field, value.trim())} disabled={!ok && !optional} className="flex-1 justify-center">
          Continue <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
        {optional && (
          <button onClick={() => onCommit(field, '')} className="px-3 py-2 text-sm font-medium text-subtle hover:text-text">
            Skip
          </button>
        )}
      </div>
    </div>
  )
}

function AvatarPick({ field, onCommit }: { field: string; onCommit: (f: string, v: unknown) => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [name, setName] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-4">
      <button
        onClick={() => ref.current?.click()}
        className="flex w-full items-center gap-4 rounded-2xl border border-dashed border-border-strong bg-surface px-4 py-4 text-left transition-colors hover:border-primary"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-bg text-primary-strong">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-6 w-6" />
          )}
        </span>
        <span className="text-sm font-medium text-muted">{name || 'Choose a photo'}</span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          setName(f.name)
          setPreview(URL.createObjectURL(f))
        }}
      />
      <div className="flex items-center gap-3">
        <PrimaryButton onClick={() => onCommit(field, name)} className="flex-1 justify-center">
          Continue <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
        <button onClick={() => onCommit(field, '')} className="px-3 py-2 text-sm font-medium text-subtle hover:text-text">
          Skip
        </button>
      </div>
    </div>
  )
}

function InterestPick({
  step, onCommit,
}: { step: Extract<Step, { kind: 'interests' }>; onCommit: (f: string, v: unknown) => void }) {
  const [picked, setPicked] = useState<string[]>([])
  const min = step.min ?? 1
  const toggle = (v: string) =>
    setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {step.options.map((o) => {
          const on = picked.includes(o.value)
          const Icon = o.icon
          return (
            <button
              key={o.value}
              onClick={() => toggle(o.value)}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all ${
                on
                  ? 'border-primary bg-primary-bg text-primary-strong'
                  : 'border-border bg-surface text-muted hover:border-primary-strong'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {o.label}
            </button>
          )
        })}
      </div>
      <PrimaryButton onClick={() => onCommit(step.field, picked)} disabled={picked.length < min} className="w-full justify-center">
        Continue <ArrowRight className="h-4 w-4" />
      </PrimaryButton>
    </div>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function EmailInput({ field, onCommit }: { field: string; onCommit: (f: string, v: unknown) => void }) {
  const [value, setValue] = useState('')
  const ok = EMAIL_RE.test(value)
  const submit = () => ok && onCommit(field, value.trim())
  return (
    <div className="space-y-3">
      <input
        autoFocus
        type="email"
        inputMode="email"
        className={inputClass}
        placeholder="you@email.com"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <PrimaryButton onClick={submit} disabled={!ok} className="w-full justify-center">
        Send my code <ArrowRight className="h-4 w-4" />
      </PrimaryButton>
    </div>
  )
}

// Stubbed for the prototype: any 6 digits unlocks. The real verifyOtp call drops
// in here in the follow-up.
function OtpInput({ field, onCommit }: { field: string; onCommit: (f: string, v: unknown) => void }) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const code = digits.join('')
  const ok = code.length === 6

  const set = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[i] = d
      return next
    })
    if (d && i < 5) refs.current[i + 1]?.focus()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el }}
            autoFocus={i === 0}
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
            }}
            className="h-14 w-full rounded-xl border border-border bg-surface text-center text-xl font-bold text-text outline-none focus:border-primary"
          />
        ))}
      </div>
      <PrimaryButton onClick={() => ok && onCommit(field, code)} disabled={!ok} className="w-full justify-center">
        Verify <Check className="h-4 w-4" />
      </PrimaryButton>
    </div>
  )
}
