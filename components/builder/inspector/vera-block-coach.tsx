'use client'

// VERA'S QUESTIONS FOR THE BLOCK IN THE INSPECTOR (PROG-E8, dark). Questions only: each one names a field of the
// block and is worded by the reviewed catalog, never by the model, and nothing here writes to a field (ADR-1939 §4).
//
// Creation-time only (ADR-976 D-4): when the block arrives with its word fields empty she asks once, by herself.
// After that she speaks only when the owner presses Ask Vera. An edit, an idle canvas or a save never calls her.
// Mounted only by the staff-only, EDITOR_CANVAS-gated /pages/canvas route.

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import type { BlockCoaching } from '@/lib/ai/vera/block-coach'
import { askVeraAboutCanvasBlock } from '@/app/(main)/pages/canvas/actions'

export function VeraBlockCoach({
  title, values, fresh, spaceId,
}: {
  /** The block's name, for the heading. */
  title: string
  /** The block's desktop values, read only. Vera never writes them. */
  values: Readonly<Partial<Record<string, string | boolean>>>
  /** True when the block was just created with its word fields empty: the one moment she speaks first. */
  fresh: boolean
  spaceId?: string
}) {
  const [coaching, setCoaching] = useState<BlockCoaching | null>(null)
  const [quiet, setQuiet] = useState(false)
  const [pending, start] = useTransition()
  const opened = useRef(false)

  const ask = (trigger: 'block-created' | 'asked') =>
    start(async () => {
      const result = await askVeraAboutCanvasBlock({ trigger, values, spaceId }).catch(() => null)
      setCoaching(result)
      setQuiet(result === null)
    })

  useEffect(() => {
    if (!fresh || opened.current) return
    opened.current = true
    ask('block-created')
    // Creation is a single moment: this runs once for the block, never again on later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh])

  return (
    <section aria-label={`Vera on the ${title.toLowerCase()}`} className="mt-4 space-y-2 border-t border-border pt-4">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
        <h3 className="text-body-sm font-semibold text-text">Vera asks</h3>
        <Button type="button" variant="secondary" className="min-h-11" disabled={pending} onClick={() => ask('asked')}>
          {pending ? 'Thinking…' : 'Ask Vera'}
        </Button>
      </div>
      <div aria-live="polite">
        {coaching && coaching.questions.length > 0 ? (
          <ul className="space-y-2" data-vera-source={coaching.source}>
            {coaching.questions.map((q) => (
              <li key={`${q.field}:${q.question}`} data-field={q.field} className="text-body-sm">
                <span className="mu-label">{q.label}</span>
                <span className="block text-text">{q.question}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-meta text-muted">
            {quiet ? 'Vera has nothing to ask here right now.' : 'Questions to help you decide what to write. The words stay yours.'}
          </p>
        )}
      </div>
    </section>
  )
}
