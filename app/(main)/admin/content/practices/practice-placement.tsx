'use client'

// A Pillar and Sub Focus suggested from a practice's nearest neighbours (LIVE-643, ADR-1606).
//
// Two doors onto the same suggestion:
//   • PracticePlacementButton: the workspace row's explicit lookup, shown only on a row missing a
//     Pillar or a Sub Focus. Like the near-duplicate lookup beside it, it runs on a tap, never as an
//     always-on column (PRACTICE-LIBRARY §5).
//   • PracticePlacementAccept: the needs-attention panel, which reads the suggestion on the server
//     and hands it in ready to accept.
// Accept sends back only what the curator saw; the server re-reads it and fills only what is empty.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Compass } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { isError } from '@/lib/action-result'
import type { PlacementPick, PlacementSuggestion } from '@/lib/practices/suggest'
import { acceptPracticePlacementAction, suggestPracticePlacementAction } from '../actions'

function agreeLine(p: PlacementPick): string {
  return `${p.agreeing} of ${p.voters} close practices agree`
}

/** The suggestion in words plus one Accept. Reports what was filed, or why not. */
function SuggestionRow({ id, suggestion, compact = false }: { id: string; suggestion: PlacementSuggestion; compact?: boolean }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const router = useRouter()
  const { pillar, subFocus } = suggestion
  const label = [pillar?.name, subFocus?.name].filter(Boolean).join(' · ')

  function accept() {
    start(async () => {
      const r = await acceptPracticePlacementAction(id, {
        pillarId: pillar?.id ?? null,
        subFocusId: subFocus?.id ?? null,
      })
      if (isError(r)) setResult({ ok: false, text: r.error })
      else {
        setResult({ ok: true, text: `Filed under ${[r.data.pillar, r.data.subFocus].filter(Boolean).join(' · ')}.` })
        router.refresh()
      }
    })
  }

  if (result?.ok) {
    return (
      <p role="status" className="text-meta font-medium text-success">
        {result.text}
      </p>
    )
  }

  return (
    <div className={compact ? 'flex flex-wrap items-center gap-2' : 'space-y-2'}>
      {compact ? (
        <span className="text-meta text-muted" title={[pillar, subFocus].filter(Boolean).map((p) => agreeLine(p as PlacementPick)).join('; ')}>
          Suggested: <span className="font-medium text-text">{label}</span>
        </span>
      ) : (
        <dl className="space-y-1 text-body-sm">
          {pillar && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted">Pillar</dt>
              <dd className="font-medium text-text">
                {pillar.name} <span className="text-meta font-normal text-subtle">({agreeLine(pillar)})</span>
              </dd>
            </div>
          )}
          {subFocus && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted">Sub Focus</dt>
              <dd className="font-medium text-text">
                {subFocus.name} <span className="text-meta font-normal text-subtle">({agreeLine(subFocus)})</span>
              </dd>
            </div>
          )}
        </dl>
      )}
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        aria-label={`Accept ${label}`}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-meta font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" aria-hidden /> {pending ? 'Filing…' : 'Accept'}
      </button>
      {result && !result.ok && <p className="text-meta text-danger">{result.text}</p>}
    </div>
  )
}

/** The needs-attention panel's inline suggestion, read on the server. */
export function PracticePlacementAccept({ id, suggestion }: { id: string; suggestion: PlacementSuggestion }) {
  return <SuggestionRow id={id} suggestion={suggestion} compact />
}

/** The workspace row's lookup: a tap reads the neighbours and offers what they agree on. */
export function PracticePlacementButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [suggestion, setSuggestion] = useState<PlacementSuggestion | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  function look() {
    setOpen(true)
    setSuggestion(undefined)
    setError(null)
    start(async () => {
      const r = await suggestPracticePlacementAction(id)
      if (isError(r)) setError(r.error)
      else setSuggestion(r.data.suggestion)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={look}
        title={`Suggest a Pillar and Sub Focus for ${title}`}
        aria-label={`Suggest a Pillar and Sub Focus for ${title}`}
        className="shrink-0 rounded-md p-0.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <Compass className="h-3.5 w-3.5" aria-hidden />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Suggested placement" className="max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-pop">
          <h2 className="text-body font-bold text-text">Suggested placement</h2>
          <p className="mt-1 text-body-sm text-muted">
            Read from the practices that sit closest to <span className="font-medium text-text">{title}</span>.
            Accepting fills only what is empty.
          </p>
          <div className="mt-3">
            {pending && suggestion === undefined && <p className="text-body-sm text-subtle">Asking the neighbours…</p>}
            {error && <p className="text-body-sm text-danger">{error}</p>}
            {suggestion === null && (
              <p className="text-body-sm text-subtle">
                No clear pick. The closest practices disagree, there are too few of them yet, or this
                one is still waiting on its match data. Pick one in the editor.
              </p>
            )}
            {suggestion && <SuggestionRow id={id} suggestion={suggestion} />}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-body-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
            >
              Close
            </button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
