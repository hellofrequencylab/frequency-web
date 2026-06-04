'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Check, X, Send, ArrowRight, ArrowLeft, Compass } from 'lucide-react'
import { conciergeTurn, confirmProposal } from '@/app/onboarding/vera-actions'
import type { ProposedToolCall } from '@/lib/ai/vera/concierge'
import type { VeraMessage } from '@/lib/ai/vera/agent-claude'
import type { DeckSlide, VeraOpening } from '@/lib/onboarding/vera-welcome'

// Vera's onboarding lightbox (ADR-066 Phase D). It opens OVER the feed the moment
// a Founder lands from induction (?welcome=vera). Two beats: a short, personalized
// "deck" (the inspirational continuance + the one instruction that matters), then
// Vera's chat — pre-seeded with a warm opening that picks up the thread from what
// they told us at induction, never a cold "what brought you here?". Best-practice
// modal: focus-trapped, ESC + backdrop to leave, body scroll locked, reduced-motion
// friendly. There's always a one-tap escape to /circles — we never trap them on Vera.

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
    case 'draft_intro':
      return `Send an intro to @${String(a.toHandle ?? '')}?`
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

  const cardRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Dismiss: hide immediately, then strip the param so a refresh doesn't reopen.
  const close = useCallback(() => {
    setOpen(false)
    router.replace('/feed')
  }, [router])

  // Lock body scroll + focus the card + ESC-to-close while open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cardRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    if (phase === 'chat') scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, proposals, phase])

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

  if (!open) return null

  const lastSlide = slide >= slides.length - 1
  const current = slides[slide]

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vera-lightbox-title"
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl outline-none motion-safe:animate-[slideUp_0.3s_ease-out]"
      >
        {/* Warm glow header band */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/10 to-transparent" />

        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>

        {phase === 'deck' ? (
          /* ── Beat 1: the personalized deck ───────────────────────────────── */
          <div key={slide} className="relative flex flex-1 flex-col px-7 pb-7 pt-10 text-center motion-safe:animate-[slideUp_0.3s_ease-out]">
            <span className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-strong">
              <Sparkles className="h-3.5 w-3.5" /> {current.eyebrow}
            </span>
            <h2 id="vera-lightbox-title" className="mt-5 text-balance text-3xl font-bold leading-tight text-text sm:text-4xl">
              {current.title}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-pretty text-base leading-relaxed text-muted">{current.body}</p>

            {/* progress dots */}
            <div className="mt-7 flex items-center justify-center gap-2">
              {slides.map((s, i) => (
                <span
                  key={s.title}
                  className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-6 bg-primary' : 'w-1.5 bg-border-strong'}`}
                />
              ))}
            </div>

            <div className="mt-7 flex items-center justify-center gap-3">
              {slide > 0 && (
                <button
                  type="button"
                  onClick={() => setSlide((s) => s - 1)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              )}
              <button
                type="button"
                onClick={() => (lastSlide ? setPhase('chat') : setSlide((s) => s + 1))}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              >
                {lastSlide ? 'Meet Vera' : 'Next'} <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <button type="button" onClick={close} className="mx-auto mt-4 text-xs font-medium text-subtle transition-colors hover:text-muted">
              Skip for now
            </button>
          </div>
        ) : (
          /* ── Beat 2: Vera's chat (seeded continuance) ─────────────────────── */
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-6 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p id="vera-lightbox-title" className="text-sm font-bold text-text">Vera</p>
                <p className="text-xs text-subtle">Your companion here. She meets you where you are, then points you toward your people.</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
              {messages.map((m, i) => (
                <div key={i} className={m.from === 'you' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={
                      m.from === 'you'
                        ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-on-primary'
                        : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface-elevated px-3.5 py-2 text-sm text-text'
                    }
                  >
                    {m.text}
                  </div>
                </div>
              ))}

              {pending && <p className="text-xs text-subtle">Vera is thinking…</p>}

              {proposals.map((p, i) => (
                <div key={i} className="rounded-xl border border-border bg-surface-elevated p-3">
                  <p className="text-xs text-muted">{proposalLabel(p)}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => allow(p)} className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg px-3 py-1.5 text-xs font-semibold text-success hover:opacity-80">
                      <Check className="h-3.5 w-3.5" /> {p.tool === 'join_circle' ? 'Join' : 'Allow'}
                    </button>
                    <button type="button" onClick={() => setProposals((ps) => ps.filter((x) => x !== p))} className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:text-danger">
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
                    <button key={s} type="button" onClick={() => turn(s)} disabled={pending} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text transition-colors hover:bg-surface-elevated disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {!done ? (
                <div className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                    placeholder="Say something to Vera…"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
                  />
                  <button type="button" onClick={send} disabled={pending || !input.trim()} className="rounded-xl bg-primary p-2 text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              ) : null}

              <Link
                href="/circles"
                className={
                  done
                    ? 'inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover'
                    : 'inline-flex items-center gap-1 text-xs font-medium text-subtle transition-colors hover:text-text'
                }
              >
                <Compass className="h-3.5 w-3.5" /> Find your circle <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
