'use client'

// The persona picker for a lead flow (ADR-125). The visitor tells us who they are;
// we route them into the beta induction carrying that persona (?persona=), and —
// for capture-style flows — record the lead first so the signal survives a bounce.
// Client island under the server splash (page.tsx); the cards resolve from the
// client-safe persona catalog.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getPersona, type PersonaId } from '@/lib/onboarding/personas'
import { captureLead } from '../actions'

function ArrowRight() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M4 10h11M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PersonaChooser({
  flow,
  source,
  prompt,
  personas,
  captureEmail,
  defaultPersona,
}: {
  flow: string
  source: string
  prompt: string
  personas: PersonaId[]
  captureEmail: boolean
  defaultPersona?: PersonaId
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<PersonaId | null>(defaultPersona ?? null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const chosen = selected ? getPersona(selected) : null
  const inductionHref = (id: PersonaId) =>
    `/onboarding/beta?persona=${encodeURIComponent(id)}&flow=${encodeURIComponent(flow)}`

  async function go() {
    if (!selected || busy) return
    setBusy(true)
    setError('')
    if (captureEmail) {
      const res = await captureLead({ persona: selected, flow, source, email })
      if (!res.ok) {
        setError(res.error)
        setBusy(false)
        return
      }
    }
    router.push(inductionHref(selected))
  }

  return (
    <div>
      <p className="text-center text-sm font-bold uppercase tracking-[0.25em] text-primary-strong">{prompt}</p>

      <div className="mx-auto mt-7 grid max-w-3xl gap-3 sm:grid-cols-2">
        {personas.map((id) => {
          const p = getPersona(id)
          const active = selected === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSelected(id)
                setError('')
              }}
              aria-pressed={active}
              className={`flex items-start gap-4 rounded-2xl border px-5 py-4 text-left transition-colors ${
                active ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-primary/40'
              }`}
            >
              <span className="text-2xl leading-none" aria-hidden>{p.emoji}</span>
              <span>
                <span className={`block text-base font-bold ${active ? 'text-text' : 'text-text'}`}>{p.label}</span>
                <span className="mt-0.5 block text-sm text-muted">{p.pitch}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Selected → what we'll show them + the way in. */}
      {chosen && (
        <div className="mx-auto mt-8 max-w-xl rounded-3xl border border-border bg-surface p-7 text-center shadow-sm">
          <p className="font-display uppercase text-2xl text-text">{chosen.track.headline}</p>
          <ul className="mx-auto mt-4 max-w-md space-y-2 text-left">
            {chosen.track.shows.map((s) => (
              <li key={s} className="flex items-start gap-2.5 text-sm text-muted">
                <span className="mt-0.5 text-primary" aria-hidden>✓</span>
                {s}
              </li>
            ))}
          </ul>

          {captureEmail && (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') go() }}
              placeholder="you@example.com"
              autoComplete="email"
              aria-label="Email address"
              className="mt-6 w-full rounded-xl border border-border bg-marketing-canvas px-4 py-3 text-base text-text placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none"
            />
          )}

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}

          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              onClick={go}
              disabled={busy || (captureEmail && !email.trim())}
              className="text-emboss inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-3.5 text-base font-bold text-on-primary shadow-pop transition-colors hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'One sec…' : `Continue as ${chosen.label}`}
              {!busy && <ArrowRight />}
            </button>
            <Link href={chosen.track.learnMoreHref} className="text-sm font-medium text-subtle underline-offset-4 transition-colors hover:text-muted hover:underline">
              Or first, {chosen.track.learnMoreLabel.toLowerCase()}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
