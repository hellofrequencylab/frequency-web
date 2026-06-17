'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Wand2, LayoutTemplate, ChevronDown } from 'lucide-react'
import { composeJourneyAction, scaffoldJourneyAction } from '@/app/(main)/journeys/[slug]/edit/actions'
import { isError } from '@/lib/action-result'

// The Vera composer in the editor (ADR-302). New Journeys arrive fully pre-seeded from the Spark
// onboarding, so here Vera is a quiet, COLLAPSED helper for filling a manual/empty Journey or
// re-composing. It asks a few SPECIFIC questions (not one open "describe it" box) and fills a
// balanced opening week — one practice per Pillar, reused from the library or freshly written.
const PREVIEW: { tag: string; text: string }[] = [
  { tag: 'Mind', text: 'A practice to steady attention.' },
  { tag: 'Body', text: 'A physical, doable practice.' },
  { tag: 'Spirit', text: 'A reflective or connecting practice.' },
  { tag: 'Expression', text: 'A practice to make, share, or connect.' },
]

const FIELD = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'

export function JourneyComposer({ slug, isEmpty }: { slug: string; isEmpty: boolean }) {
  const router = useRouter()
  const [who, setWho] = useState('')
  const [topic, setTopic] = useState('')
  const [outcome, setOutcome] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // Collapsed on load — the onboarding wizard already pre-seeds a Journey, so this never opens as an
  // expanded "open question" on the editor. Click to expand when you actually want Vera here.
  const [open, setOpen] = useState(false)

  const build = () => {
    setError(null)
    setNote(null)
    const description = [
      who.trim() && `For: ${who.trim()}`,
      topic.trim() && `About: ${topic.trim()}`,
      outcome.trim() && `Outcome: ${outcome.trim()}`,
    ]
      .filter(Boolean)
      .join('. ')
    start(async () => {
      const res = await composeJourneyAction(slug, description)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setWho('')
      setTopic('')
      setOutcome('')
      if (!res.data.aiUsed) setNote('Vera is offline right now, so I laid down the empty shape for you to fill.')
      router.refresh()
    })
  }

  const shape = () => {
    setError(null)
    setNote(null)
    start(async () => {
      const res = await scaffoldJourneyAction(slug)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary-bg/20 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-primary-strong" />
        <h2 className="flex-1 text-base font-bold text-text">Build with Vera</h2>
        <ChevronDown className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {!open && (
        <p className="mt-1 text-sm text-muted">Answer a few specifics and Vera fills a balanced four-Pillar week.</p>
      )}
      {open && (
        <>
          <p className="mt-1 text-sm text-muted">
            A few specifics and Vera fills one practice per Pillar (Mind, Body, Spirit, Expression, new or from the
            library). Edit anything after.
          </p>
          <div className="mt-3 space-y-2.5">
            <label className="block">
              <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Who is it for</span>
              <input value={who} disabled={pending} onChange={(e) => setWho(e.target.value)} placeholder="e.g. People who feel wired and tired" className={FIELD} />
            </label>
            <label className="block">
              <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">What is it about</span>
              <input value={topic} disabled={pending} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Sleep and screen habits" className={FIELD} />
            </label>
            <label className="block">
              <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">What they walk away with</span>
              <input value={outcome} disabled={pending} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Fall asleep easier, most nights" className={FIELD} />
            </label>
          </div>
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
          {note && <p className="mt-1 text-xs text-muted">{note}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending || !topic.trim()}
              onClick={build}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60"
            >
              <Wand2 className="h-4 w-4" /> {pending ? 'Building…' : 'Build with Vera'}
            </button>
            {isEmpty && (
              <button
                type="button"
                disabled={pending}
                onClick={shape}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-elevated disabled:opacity-60"
              >
                <LayoutTemplate className="h-4 w-4" /> Start with the shape
              </button>
            )}
          </div>

          {isEmpty && (
            <div className="mt-4">
              <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">What you&apos;ll get</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {PREVIEW.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                    <span className="shrink-0 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">{p.tag}</span>
                    <span className="text-sm text-muted">{p.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}
