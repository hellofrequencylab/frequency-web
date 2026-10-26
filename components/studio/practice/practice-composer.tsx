'use client'

import { useState, useTransition } from 'react'
import { Sparkles, Wand2, ChevronDown } from 'lucide-react'
import { buildPracticeWithVeraAction, applyVeraPracticeChangeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'
import { Textarea } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { capsLabel } from '@/components/ui/caps-label'

// Both empty and existing Practices use separate coaching questions. No fields are applied or saved.
const PREVIEW: { tag: string; text: string }[] = [
  { tag: 'Hook', text: 'What would make your description clear?' },
  { tag: 'Guide', text: 'Which steps will you explain?' },
  { tag: 'Pillar', text: 'Which Pillar do you want to explore?' },
  { tag: 'Cadence', text: 'What fits your available time?' },
]


export function PracticeComposer({ id, isEmpty }: { id: string; isEmpty: boolean }) {
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
      setNote(res.data.questions.join('\n'))
    })
  }

  const apply = () => {
    setError(null)
    setNote(null)
    start(async () => {
      const res = await applyVeraPracticeChangeAction(id, change)
      if (isError(res)) { setError(res.error); return }
      setNote(res.data.questions.join('\n'))
    })
  }

  return (
    <section className="rounded-card border border-primary/30 bg-primary-bg/20 p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <Sparkles className="h-5 w-5 shrink-0 text-primary-strong" />
        <h2 className="flex-1 text-body font-bold text-text">{isEmpty ? 'Plan with Vera' : 'Coach me with Vera'}</h2>
        <ChevronDown className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {!open && (
        <p className="mt-1 text-body-sm text-muted">
          {isEmpty ? 'Ask questions about the Practice you want to write.' : 'Ask for feedback. Your Practice stays unchanged.'}
        </p>
      )}

      {open && isEmpty && (
        <>
          <p className="mt-1 text-body-sm text-muted">Describe what you want to work on. Vera offers questions; you write and save the content yourself.</p>
          <Textarea
            aria-label="Describe the practice"
            value={build}
            disabled={pending}
            onChange={(e) => setBuild(e.target.value)}
            rows={2}
            placeholder="e.g. A two-minute morning sit for people who wake up wired. Set a timer, breathe, notice the day." className="mt-3 resize-y"
          />
          {error && <p className="mt-1 text-meta text-danger">{error}</p>}
          {note && <p className="mt-1 whitespace-pre-wrap text-meta text-muted" role="status">{note}</p>}
          <div className="mt-3">
            <Button type="button" disabled={pending || !build.trim()} onClick={runBuild}>
              <Wand2 className="h-4 w-4" /> {pending ? 'Thinking…' : 'Plan with Vera'}
            </Button>
          </div>
          <div className="mt-4">
            <p className={capsLabel('text-2xs font-semibold text-muted')}>Questions to consider</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {PREVIEW.map((p, i) => (
                <li key={i} className="flex items-start gap-2 rounded-control border border-border bg-surface px-3 py-2">
                  <span className="shrink-0 rounded-pill bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">{p.tag}</span>
                  <span className="text-body-sm text-muted">{p.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {open && !isEmpty && (
        <>
          <p className="mt-1 text-body-sm text-muted">Tell Vera what you want to review. Questions appear here without replacing or saving any fields.</p>
          <Textarea
            aria-label="What you want to review"
            value={change}
            disabled={pending}
            onChange={(e) => setChange(e.target.value)}
            rows={2}
            placeholder="e.g. What should I check to make the instructions clearer?" className="mt-3 resize-y"
          />
          {error && <p className="mt-1 text-meta text-danger">{error}</p>}
          {note && <p className="mt-1 whitespace-pre-wrap text-meta text-muted" role="status">{note}</p>}
          <div className="mt-3">
            <Button type="button" disabled={pending || !change.trim()} onClick={apply}>
              <Wand2 className="h-4 w-4" /> {pending ? 'Thinking…' : 'Get coaching questions'}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
