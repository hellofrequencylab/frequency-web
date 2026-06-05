'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, Loader2, Plus, Check, Sparkles } from 'lucide-react'
import { rateContent, adoptProgram, submitProgram } from './actions'
import { isError } from '@/lib/action-result'
import type { ContentType } from '@/lib/library'

const PILLARS = ['', 'mind', 'body', 'spirit', 'expression'] as const

// A "love" toggle — the ratings signal that feeds the best-of score.
export function RateButton({ type, id, count, rated }: { type: ContentType; id: string; count: number; rated: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [on, setOn] = useState(rated)
  const [n, setN] = useState(count)
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !on
          setOn(next)
          setN((v) => v + (next ? 1 : -1))
          const res = await rateContent(type, id)
          if (isError(res)) { setOn(!next); setN((v) => v + (next ? -1 : 1)) }
          else router.refresh()
        })
      }
      aria-pressed={on}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
        on ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border text-muted hover:text-text'
      }`}
      title={on ? 'Remove your rating' : 'Rate this'}
    >
      <Heart className={`h-3.5 w-3.5 ${on ? 'fill-current' : ''}`} /> {n}
    </button>
  )
}

export function AdoptButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      disabled={pending || done}
      onClick={() =>
        start(async () => {
          const res = await adoptProgram(id)
          if (!isError(res)) { setDone(true); router.refresh() }
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      {done ? 'Adopted' : 'Run this'}
    </button>
  )
}

// Anyone can propose a Program (outreach toolkit) → enters the review queue.
export function SubmitProgramForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [pillar, setPillar] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const field = 'w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-border-strong focus:outline-none'

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        <Plus className="h-4 w-4" /> Propose a program
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold text-text">Propose a program</p>
      </div>
      <p className="text-xs text-muted">A toolkit that helps people put a real-world activity together. A Host or Guide+ reviews it before it joins the Library.</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — e.g. Start a neighborhood ride" className={field} />
      <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line summary" className={field} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="The how-to: steps, tips, what to bring…" className={`${field} resize-none`} />
      <div className="flex flex-wrap items-center gap-2">
        <select value={pillar} onChange={(e) => setPillar(e.target.value)} className={field + ' w-auto'}>
          {PILLARS.map((p) => <option key={p} value={p}>{p ? p[0].toUpperCase() + p.slice(1) : 'No pillar'}</option>)}
        </select>
        <button
          type="button"
          disabled={pending || !title.trim()}
          onClick={() =>
            start(async () => {
              setError(null); setMsg(null)
              const res = await submitProgram({ title, summary, body, pillar })
              if (isError(res)) { setError(res.error); return }
              setMsg('Submitted for review — a leader will approve it into the Library.')
              setTitle(''); setSummary(''); setBody(''); setPillar('')
              setOpen(false)
              router.refresh()
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Submit for review
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-subtle hover:text-text">Cancel</button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {msg && <p className="text-xs text-success">{msg}</p>}
    </div>
  )
}
