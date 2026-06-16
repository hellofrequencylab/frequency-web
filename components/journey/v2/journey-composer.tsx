'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Wand2, LayoutTemplate } from 'lucide-react'
import { composeJourneyAction, scaffoldJourneyAction } from '@/app/(main)/journeys/[slug]/edit/actions'
import { isError } from '@/lib/action-result'

// The Vera "build my Journey" composer — the box at the TOP of the Curriculum tab. The author
// describes what they're making; Vera fills a balanced opening week (a Mind, Body, and Spirit
// practice — reused from the library or freshly written — plus two challenges). The empty shape
// is shown as a preview, and "Start with the shape" lays it down without AI to fill by hand.
const PREVIEW: { tag: string; text: string }[] = [
  { tag: 'Mind', text: 'A practice to steady attention.' },
  { tag: 'Body', text: 'A physical, doable practice.' },
  { tag: 'Spirit', text: 'A reflective or connecting practice.' },
  { tag: 'Challenge', text: 'A small real-world task.' },
  { tag: 'Challenge', text: 'A second, slightly bigger task.' },
]

export function JourneyComposer({ slug, isEmpty }: { slug: string; isEmpty: boolean }) {
  const router = useRouter()
  const [desc, setDesc] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const build = () => {
    setError(null)
    setNote(null)
    start(async () => {
      const res = await composeJourneyAction(slug, desc)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setDesc('')
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
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary-strong" />
        <h2 className="text-base font-bold text-text">Build your Journey with Vera</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        Tell Vera what you&apos;re making. She&apos;ll add a Mind, Body, and Spirit practice (new ones or picks from the
        library) plus two challenges. You can edit anything after.
      </p>
      <textarea
        value={desc}
        disabled={pending}
        onChange={(e) => setDesc(e.target.value)}
        rows={3}
        placeholder="e.g. A 3-week reset for people who want to sleep better and scroll less."
        className="mt-3 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !desc.trim()}
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
    </section>
  )
}
