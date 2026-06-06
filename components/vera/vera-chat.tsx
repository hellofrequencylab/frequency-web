'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { Check, X, Send, Bug } from 'lucide-react'
import { conciergeTurn, confirmProposal } from '@/app/onboarding/vera-actions'
import { openSupport } from '@/components/support/support-launcher'
import type { ProposedToolCall } from '@/lib/ai/vera/concierge'
import type { VeraMessage } from '@/lib/ai/vera/agent-claude'

// The headless Vera conversation — the multi-turn chat with propose-and-confirm
// writes, extracted so the onboarding lightbox AND the persistent companion
// launcher share one implementation (AI-VERA §4.0). It renders the transcript +
// composer + suggestion chips only; the host (lightbox / launcher) provides the
// surrounding chrome. Every turn runs the live Claude loop when the kernel is on
// and the deterministic concierge otherwise — both via `conciergeTurn`.

interface Msg {
  from: 'vera' | 'you'
  text: string
}

export interface VeraOpeningSeed {
  /** Vera's first line, shown immediately (no server round-trip). */
  message: string
  /** The stage to pass into the first turn (deterministic path only). */
  stage: string
  /** Quick-reply chips offered with the opening. */
  suggestions: string[]
}

/** Member-facing label for a proposed write Vera wants to make. */
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

export function VeraChat({ opening }: { opening: VeraOpeningSeed }) {
  const [messages, setMessages] = useState<Msg[]>([{ from: 'vera', text: opening.message }])
  const [stage, setStage] = useState<string>(opening.stage)
  const [proposals, setProposals] = useState<ProposedToolCall[]>([])
  const [suggestions, setSuggestions] = useState<string[]>(opening.suggestions)
  const [input, setInput] = useState('')
  const [pending, start] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, proposals])

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
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
      <div className="shrink-0 space-y-2.5 border-t border-border px-4 py-3">
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => turn(s)} disabled={pending} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text transition-colors hover:bg-surface-elevated disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            placeholder="Say something to Vera…"
            aria-label="Message Vera"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
          />
          <button type="button" onClick={send} disabled={pending || !input.trim()} aria-label="Send" className="rounded-xl bg-primary p-2 text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50">
            <Send className="h-4 w-4" />
          </button>
        </div>
        {/* Always-available bug report — opens the capture dialog (page details +
            screenshot). Vera can also point members here in conversation. */}
        <button
          type="button"
          onClick={() => openSupport('bug')}
          className="inline-flex items-center gap-1.5 text-2xs font-medium text-subtle transition-colors hover:text-text"
        >
          <Bug className="h-3.5 w-3.5" /> Report a bug or get help
        </button>
      </div>
    </div>
  )
}

/** The persistent companion's cool-register opening (AI-VERA §2). Generic — she
 *  meets a member anywhere, not mid-onboarding. */
export const COMPANION_OPENING: VeraOpeningSeed = {
  message:
    "Hey — I'm Vera. I keep this place running, and I'm on your side. What's on your mind? I can help you find your people, sort out how something works, or just point you somewhere good.",
  stage: 'greet',
  suggestions: ['Find me a circle', 'How does this work?', "I'm new here"],
}
