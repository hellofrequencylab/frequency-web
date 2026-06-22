'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Wand2, ChevronDown } from 'lucide-react'
import { buildPracticeWithVeraAction, applyVeraPracticeChangeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'

// The Vera composer in the Practice editor (ADR-358), the atom-level twin of the Journey composer
// (components/journey/v2/journey-composer.tsx). Two modes, by whether the Practice has a guide yet:
//   • EMPTY  — a single "describe it" line; Vera drafts the whole Practice (name, hook, guide,
//              Pillar, cadence) in place.
//   • FILLED — a single "tell Vera what to change" line; Vera reads the whole Practice and applies
//              the edit in place. Collapsed on load.
const PREVIEW: { tag: string; text: string }[] = [
  { tag: 'Hook', text: 'A short line for the card, for the skeptic.' },
  { tag: 'Guide', text: 'A few concrete steps in plain words.' },
  { tag: 'Pillar', text: 'The Pillar the act fits, set for you.' },
  { tag: 'Cadence', text: 'How often and how long, suggested.' },
]

const FIELD = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'

export function PracticeComposer({ id, isEmpty }: { id: string; isEmpty: boolean }) {
  const router = useRouter()
  const [build, setBuild] = useState('')
  const [change, setChange] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const runBuild = () => {
    setError(null)
    setNote(null)
    start(async () => {
      const res = await buildPracticeWithVeraAction(id, build)
      if (isError(res)) { setError(res.error); return }
      setBuild('')
      if (!res.data.aiUsed) setNote('Vera is offline right now, so fill it in below and keep going.')
      router.refresh()
    })
  }

  const apply = () => {
    setError(null)
    setNote(null)
    start(async () => {
      const res = await applyVeraPracticeChangeAction(id, change)
      if (isError(res)) { setError(res.error); return }
      setChange('')
      setNote(res.data.applied > 0 ? `Vera made ${res.data.applied} ${res.data.applied === 1 ? 'change' : 'changes'}.` : 'Nothing to change there.')
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary-bg/20 p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <Sparkles className="h-5 w-5 shrink-0 text-primary-strong" />
        <h2 className="flex-1 text-base font-bold text-text">{isEmpty ? 'Build with Vera' : 'Edit with Vera'}</h2>
        <ChevronDown className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {!open && (
        <p className="mt-1 text-sm text-muted">
          {isEmpty ? 'Describe the practice in a line and Vera drafts the whole thing.' : 'Tell Vera what to change and she updates the practice.'}
        </p>
      )}

      {open && isEmpty && (
        <>
          <p className="mt-1 text-sm text-muted">Describe the practice in plain words. Vera drafts the name, the hook, the guide, the Pillar, and a cadence. Edit anything after.</p>
          <textarea
            value={build}
            disabled={pending}
            onChange={(e) => setBuild(e.target.value)}
            rows={2}
            placeholder="e.g. A two-minute morning sit for people who wake up wired. Set a timer, breathe, notice the day."
            className={`mt-3 resize-y ${FIELD}`}
          />
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
          {note && <p className="mt-1 text-xs text-muted">{note}</p>}
          <div className="mt-3">
            <button type="button" disabled={pending || !build.trim()} onClick={runBuild} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">
              <Wand2 className="h-4 w-4" /> {pending ? 'Building…' : 'Build with Vera'}
            </button>
          </div>
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
        </>
      )}

      {open && !isEmpty && (
        <>
          <p className="mt-1 text-sm text-muted">Tell Vera what to change in plain words. She reads the whole practice and applies it. You can undo by editing any field by hand.</p>
          <textarea
            value={change}
            disabled={pending}
            onChange={(e) => setChange(e.target.value)}
            rows={2}
            placeholder="e.g. Make it gentler. Or: shorten the steps. Or: rewrite the hook for someone who can't switch off."
            className={`mt-3 resize-y ${FIELD}`}
          />
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
          {note && <p className="mt-1 text-xs text-muted">{note}</p>}
          <div className="mt-3">
            <button type="button" disabled={pending || !change.trim()} onClick={apply} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">
              <Wand2 className="h-4 w-4" /> {pending ? 'Applying…' : 'Apply with Vera'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
