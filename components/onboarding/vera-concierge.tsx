'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Sparkles, Check, X, Send, ArrowRight } from 'lucide-react'
import { conciergeTurn, confirmProposal } from '@/app/onboarding/vera-actions'
import type { ProposedToolCall } from '@/lib/ai/vera/concierge'
import type { VeraMessage } from '@/lib/ai/vera/agent-claude'

// Vera's onboarding concierge (ADR-066 Phase D). A bounded, paced conversation that
// gets the member toward a real circle/person, then steps back. Runs the deterministic
// loop today; the live AI kernel makes it smarter behind the same actions. Every write
// Vera proposes is shown as an explicit Allow/Skip — propose-and-confirm, no exceptions.
interface Msg {
  from: 'vera' | 'you'
  text: string
}

export function VeraConcierge() {
  const [started, setStarted] = useState(false)
  const [stage, setStage] = useState<string>('greet')
  const [messages, setMessages] = useState<Msg[]>([])
  const [proposals, setProposals] = useState<ProposedToolCall[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [input, setInput] = useState('')
  const [pending, start] = useTransition()

  function turn(text: string) {
    // Prior turns (before this message) become the live loop's conversation history.
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

  if (!started) {
    return (
      <button
        type="button"
        onClick={() => { setStarted(true); turn('') }}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
      >
        <Sparkles className="h-4 w-4" />
        Talk to Vera
      </button>
    )
  }

  return (
    <div className="space-y-3">
      {messages.map((m, i) => (
        <div key={i} className={m.from === 'you' ? 'flex justify-end' : 'flex justify-start'}>
          <div
            className={
              m.from === 'you'
                ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-on-primary'
                : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface px-3.5 py-2 text-sm text-text'
            }
          >
            {m.text}
          </div>
        </div>
      ))}

      {pending && <p className="text-xs text-subtle">Vera is thinking…</p>}

      {proposals.map((p, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface-elevated p-3">
          <p className="text-xs text-muted">
            Vera wants to remember: <span className="font-medium text-text">&ldquo;{String(p.args.fact ?? p.args.value ?? '')}&rdquo;</span>
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => allow(p)} className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg px-3 py-1.5 text-xs font-semibold text-success hover:opacity-80">
              <Check className="h-3.5 w-3.5" /> Allow
            </button>
            <button type="button" onClick={() => setProposals((ps) => ps.filter((x) => x !== p))} className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:text-danger">
              <X className="h-3.5 w-3.5" /> Skip
            </button>
          </div>
        </div>
      ))}

      {!done && (
        <>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => turn(s)} disabled={pending} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text hover:bg-surface-elevated disabled:opacity-50">
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
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
            />
            <button type="button" onClick={send} disabled={pending || !input.trim()} className="rounded-xl bg-primary p-2 text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {/* The concrete next action toward a real thing — always available, emphasized
          once Vera has done her job (AI-VERA §3: get them to a circle, then step back). */}
      <Link
        href="/circles"
        className={
          done
            ? 'mt-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover'
            : 'mt-1 inline-flex items-center gap-1 text-xs font-medium text-subtle transition-colors hover:text-text'
        }
      >
        Find your circle <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
