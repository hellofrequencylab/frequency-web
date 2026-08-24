'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Check, X, Send, ArrowRight, ArrowLeft, Compass } from 'lucide-react'
import { conciergeTurn, confirmProposal } from '@/app/onboarding/vera-actions'
import type { ProposedToolCall } from '@/lib/ai/vera/concierge'
import type { VeraMessage } from '@/lib/ai/vera/agent-claude'
import type { DeckSlide, VeraOpening } from '@/lib/onboarding/vera-welcome'
import { WelcomeArt } from '@/components/onboarding/welcome-art'
import { Input } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'

// Vera's onboarding lightbox (ADR-066 Phase D). It opens OVER the feed the moment
// a Founder lands from induction (?welcome=vera). Two beats: a short, personalized
// "deck" (the inspirational continuance + the one instruction that matters), then
// Vera's chat — pre-seeded with a warm opening that picks up the thread from what
// they told us at induction, never a cold "what brought you here?". There's always a
// one-tap escape to /circles — we never trap them on Vera.
//
// THE OVERLAY IS `Dialog` (LIVE-089). The old comment above claimed this was a
// "best-practice modal: focus-trapped" — it was not. It set aria-modal="true" and
// focused its card, and that was the whole of it: Tab walked straight back out into the
// feed the modal had just declared inert, and focus never returned to the trigger. ESC
// and the scroll lock were real but hand-rolled, and there was no portal (so the sliding
// admin rail could trap it) and no Space theme across it (ADR-1097).
//
// ONE DELIBERATE CHANGE, not a silent one: the tier moves z-[60] -> z-[80]. z-[60] was the
// tier `Dialog` ITSELF abandoned, for the reason its own comment records — at z-[60] a modal
// renders BEHIND the z-[70] mobile admin sheet while still locking scroll and trapping focus
// off-screen. Nothing opens over this lightbox on purpose (it hosts no nested dialog), so the
// low tier was inheritance, not intent. The scrim is untouched: bg-ink/60 + backdrop-blur-sm
// is already exactly what the primitive paints.

// Idle delay before the window settles into sleep mode (fades further).
const SLEEP_MS = 16000

interface Msg {
  from: 'vera' | 'you'
  text: string
}

function proposalLabel(p: ProposedToolCall): string {
  const a = p.args
  switch (p.tool) {
    case 'join_circle':
      return `Join ${String(a.circle ?? 'this circle')}?`
    case 'set_profile_field':
      return `Update your ${String(a.field ?? 'profile')} to “${String(a.value ?? '')}”?`
    case 'draft_intro': {
      const msg = String(a.message ?? '').trim()
      return msg
        ? `Post this intro to @${String(a.toHandle ?? '')}? “${msg}”`
        : `Post an intro to @${String(a.toHandle ?? '')}?`
    }
    default:
      return `Remember: “${String(a.fact ?? a.value ?? '')}”`
  }
}

export function VeraLightbox({
  slides,
  opening,
  startInChat = false,
}: {
  slides: DeckSlide[]
  opening: VeraOpening
  /** Skip the inspirational deck and open straight in chat — for "Ask Vera"
   *  (a returning member asking for help), vs. the post-induction welcome. */
  startInChat?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [phase, setPhase] = useState<'deck' | 'chat'>(startInChat ? 'chat' : 'deck')
  const [slide, setSlide] = useState(0)

  // Chat state — seeded with Vera's continuance so her first line already knows them.
  const [messages, setMessages] = useState<Msg[]>([{ from: 'vera', text: opening.message }])
  const [stage, setStage] = useState<string>(opening.stage)
  const [proposals, setProposals] = useState<ProposedToolCall[]>([])
  const [suggestions, setSuggestions] = useState<string[]>(opening.suggestions)
  const [done, setDone] = useState(false)
  const [input, setInput] = useState('')
  const [pending, start] = useTransition()
  // Sleep mode: after a stretch of no interaction the window settles back, fading
  // further so it recedes while you think. Any movement, key, or tap wakes it.
  const [asleep, setAsleep] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Dismiss: hide immediately, then strip the param so a refresh doesn't reopen.
  const close = useCallback(() => {
    setOpen(false)
    router.replace('/feed')
  }, [router])

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    if (phase === 'chat') scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, proposals, phase])

  // Sleep when idle: settle (fade further) after a stretch of stillness; any
  // movement, key, or tap wakes it. Mirrors the onboarding cue's recede behaviour.
  useEffect(() => {
    if (!open) return
    let timer = window.setTimeout(() => setAsleep(true), SLEEP_MS)
    const wake = () => {
      setAsleep((a) => (a ? false : a))
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setAsleep(true), SLEEP_MS)
    }
    document.addEventListener('mousemove', wake)
    document.addEventListener('keydown', wake)
    document.addEventListener('pointerdown', wake)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousemove', wake)
      document.removeEventListener('keydown', wake)
      document.removeEventListener('pointerdown', wake)
    }
  }, [open])

  function turn(text: string) {
    const history: VeraMessage[] = messages.map((m) => ({ role: m.from === 'you' ? 'user' : 'assistant', text: m.text }))
    if (text) setMessages((m) => [...m, { from: 'you', text }])
    setProposals([])
    setSuggestions([])
    start(async () => {
      const r = await conciergeTurn(stage, text, history)
      setMessages((m) => [...m, { from: 'vera', text: r.message }])
      setStage(r.stage)
      setProposals(r.proposals)
      setSuggestions(r.suggestions)
      setDone(r.done)
    })
  }

  function send() {
    const t = input.trim()
    if (!t || pending) return
    setInput('')
    turn(t)
  }

  async function allow(p: ProposedToolCall) {
    setProposals((ps) => ps.filter((x) => x !== p))
    await confirmProposal(p.tool, JSON.stringify(p.args))
  }

  const lastSlide = slide >= slides.length - 1
  const current = slides[slide]

  return (
    <Dialog open={open} onClose={close} ariaLabelledBy="vera-lightbox-title" align="center" className="max-w-lg">
      <div
        onMouseEnter={() => setAsleep(false)}
        className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl border border-border bg-surface/90 shadow-2xl backdrop-blur-md transition-opacity duration-700 ${asleep ? 'opacity-65' : 'opacity-100'}`}
      >
        {/* Warm glow header band */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/10 to-transparent" />

        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-pill p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>

        {phase === 'deck' ? (
          /* ── Beat 1: the personalized deck ───────────────────────────────── */
          <div key={slide} className="relative flex flex-1 flex-col overflow-y-auto px-7 pb-7 pt-8 text-center motion-safe:animate-[slideUp_0.3s_ease-out]">
            <WelcomeArt art={current.art} className="mx-auto mb-5 h-28 sm:h-32" />
            <span className="mx-auto inline-flex items-center gap-1.5 rounded-pill bg-primary-bg px-3 py-1 text-meta font-semibold uppercase tracking-wide text-primary-strong">
              <Sparkles className="h-3.5 w-3.5" /> {current.eyebrow}
            </span>
            <h2 id="vera-lightbox-title" className="mt-4 text-balance text-page-title font-bold leading-tight text-text sm:text-3xl">
              {current.title}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-pretty text-body-sm leading-relaxed text-muted sm:text-body">{current.body}</p>

            {/* progress dots */}
            <div className="mt-7 flex items-center justify-center gap-2">
              {slides.map((s, i) => (
                <span
                  key={s.title}
                  className={`h-1.5 rounded-pill transition-all ${i === slide ? 'w-6 bg-primary' : 'w-1.5 bg-border-strong'}`}
                />
              ))}
            </div>

            <div className="mt-7 flex items-center justify-center gap-3">
              {slide > 0 && (
                <button
                  type="button"
                  onClick={() => setSlide((s) => s - 1)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-body-sm font-medium text-muted transition-colors hover:text-text"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              )}
              <button
                type="button"
                onClick={() => (lastSlide ? setPhase('chat') : setSlide((s) => s + 1))}
                className="inline-flex items-center gap-2 rounded-control bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
              >
                {lastSlide ? 'Meet Vera' : 'Next'} <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <button type="button" onClick={close} className="mx-auto mt-4 text-meta font-medium text-subtle transition-colors hover:text-muted">
              Skip for now
            </button>
          </div>
        ) : (
          /* ── Beat 2: Vera's chat (seeded continuance) ─────────────────────── */
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-6 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-primary-bg text-primary-strong">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p id="vera-lightbox-title" className="text-body-sm font-bold text-text">Vera</p>
                {/* AI disclosure (EU AI Act Art. 50): members must know they're talking to AI. */}
                <p className="text-meta text-subtle">Vera is AI. She meets you where you are, then points you toward your people.</p>
              </div>
            </div>

            {/* Live region — same contract as the companion transcript in
                components/vera/vera-chat.tsx: append-only `log`, `polite` because a turn arrives
                whole, `additions` + non-atomic so only the new bubble is spoken. Composer stays
                outside. */}
            <div
              ref={scrollRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-atomic="false"
              aria-label="Conversation with Vera"
              className="flex-1 space-y-3 overflow-y-auto px-6 py-5"
            >
              {messages.map((m, i) => (
                <div key={i} className={m.from === 'you' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={
                      m.from === 'you'
                        ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-body-sm text-on-primary'
                        : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface-elevated px-3.5 py-2 text-body-sm text-text'
                    }
                  >
                    {m.text}
                  </div>
                </div>
              ))}

              {pending && <p className="text-meta text-subtle">Vera is thinking…</p>}

              {proposals.map((p, i) => (
                <div key={i} className="rounded-card border border-border bg-surface-elevated p-3">
                  <p className="text-meta text-muted">{proposalLabel(p)}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => allow(p)} className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg px-3 py-1.5 text-meta font-semibold text-success hover:opacity-80">
                      <Check className="h-3.5 w-3.5" /> {p.tool === 'join_circle' ? 'Join' : p.tool === 'draft_intro' ? 'Post' : 'Allow'}
                    </button>
                    <button type="button" onClick={() => setProposals((ps) => ps.filter((x) => x !== p))} className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-meta font-medium text-muted hover:text-danger">
                      <X className="h-3.5 w-3.5" /> Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* composer + chips */}
            <div className="shrink-0 space-y-2.5 border-t border-border px-6 py-4">
              {!done && suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => turn(s)} disabled={pending} className="rounded-pill border border-border bg-surface px-3 py-1 text-meta text-text transition-colors hover:bg-surface-elevated disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {!done ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                    placeholder="Say something to Vera…"
                  />
                  <button type="button" onClick={send} disabled={pending || !input.trim()} aria-label="Send message" className="rounded-xl bg-primary p-2 text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50">
                    <Send className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : null}

              <Link
                href="/circles"
                className={
                  done
                    ? 'inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover'
                    : 'inline-flex items-center gap-1 text-meta font-medium text-subtle transition-colors hover:text-text'
                }
              >
                <Compass className="h-3.5 w-3.5" /> Find your circle <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
