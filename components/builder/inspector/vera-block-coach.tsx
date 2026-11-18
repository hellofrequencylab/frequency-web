'use client'

// VERA'S QUESTIONS FOR THE BLOCK IN THE INSPECTOR (PROG-E8, dark). Questions only: each one names a field of the
// block and is worded by the reviewed catalog, never by the model, and nothing here writes to a field (ADR-1939 §4).
//
// Creation-time only (ADR-976 D-4): when the block arrives with its word fields empty she asks once, by herself.
// After that she speaks only when the owner presses Ask Vera. An edit, an idle canvas or a save never calls her.
// Mounted only by the staff-only, EDITOR_CANVAS-gated /pages/canvas route: on the demo Banner, and on the block
// selected in a real Space page document (`nid`), where the server reads the block's type from the stored page.
//
// WHAT THE OWNER CAN DO WITH A QUESTION (PROG-E8B). Two things, and neither writes a word. "Answer this" moves the
// cursor to that field in the inspector beside her, so the owner types the answer themselves. "Not now" puts the
// question away. Each fires one first-party event (lib/builder/vera-coach.ts VERA_QUESTION_EVENT) carrying ids, the
// block type, the question's position and how many were shown. The wording, the label and the field's content are
// never sent, and the two events are barred from every pixel (lib/analytics/sanitize.ts FIRST_PARTY_ONLY_EVENTS).

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { trackClient } from '@/components/analytics/track-provider'
import type { BlockCoaching } from '@/lib/ai/vera/block-coach'
import { VERA_QUESTION_EVENT, veraQuestionProps, type BlockQuestion, type VeraQuestionOutcome } from '@/lib/builder/vera-coach'
import { askVeraAboutCanvasBlock } from '@/app/(main)/pages/canvas/actions'

const keyOf = (q: BlockQuestion) => `${q.field}:${q.questionId}`

export function VeraBlockCoach({
  title, values, fresh, spaceId, nid,
}: {
  /** The block's name, for the heading. */
  title: string
  /** The block's desktop values, read only. Vera never writes them. */
  values: Readonly<Partial<Record<string, string | boolean>>>
  /** True when the block was just created with its word fields empty: the one moment she speaks first. */
  fresh: boolean
  spaceId?: string
  /** On a real document: the selected node's id. The server reads its type and fields from the stored page. */
  nid?: string
}) {
  const [coaching, setCoaching] = useState<BlockCoaching | null>(null)
  const [quiet, setQuiet] = useState(false)
  /** What the owner did with each question of the current answer, by field and question id. One outcome each. */
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, VeraQuestionOutcome>>>({})
  const [pending, start] = useTransition()
  const opened = useRef(false)
  const section = useRef<HTMLElement>(null)

  const ask = (trigger: 'block-created' | 'asked') =>
    start(async () => {
      const result = await askVeraAboutCanvasBlock({ trigger, values, spaceId, ...(nid ? { nid } : {}) }).catch(() => null)
      setCoaching(result)
      setOutcomes({})
      setQuiet(result === null)
    })

  useEffect(() => {
    if (!fresh || opened.current) return
    opened.current = true
    ask('block-created')
    // Creation is a single moment: this runs once for the block, never again on later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh])

  /** Record what the owner did with one question, once. The payload is built from ids alone. */
  const settle = (question: BlockQuestion, position: number, outcome: VeraQuestionOutcome) => {
    if (!coaching || outcomes[keyOf(question)]) return
    setOutcomes((current) => ({ ...current, [keyOf(question)]: outcome }))
    trackClient(
      VERA_QUESTION_EVENT[outcome],
      veraQuestionProps(question, { blockType: coaching.blockType, source: coaching.source, position, count: coaching.questions.length }),
    )
  }

  /** Move the cursor to the field in the inspector this panel sits under. It focuses; it never types. */
  const goToField = (field: string) => {
    const scope = section.current?.parentElement
    if (!scope) return
    for (const row of scope.querySelectorAll<HTMLElement>('[data-field]')) {
      if (row.dataset.field !== field || section.current?.contains(row)) continue
      row.querySelector<HTMLElement>('input, textarea, [role="textbox"]')?.focus()
      return
    }
  }

  const open = coaching ? coaching.questions.filter((q) => outcomes[keyOf(q)] !== 'dismissed') : []

  return (
    <section ref={section} aria-label={`Vera on the ${title.toLowerCase()}`} className="mt-4 space-y-2 border-t border-border pt-4">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
        <h3 className="text-body-sm font-semibold text-text">Vera asks</h3>
        <Button type="button" variant="secondary" className="min-h-11" disabled={pending} onClick={() => ask('asked')}>
          {pending ? 'Thinking…' : 'Ask Vera'}
        </Button>
      </div>
      <div aria-live="polite">
        {coaching && open.length > 0 ? (
          <ul className="space-y-3" data-vera-source={coaching.source}>
            {open.map((q) => {
              const position = coaching.questions.indexOf(q)
              const answering = outcomes[keyOf(q)] === 'accepted'
              return (
                <li key={keyOf(q)} data-field={q.field} data-outcome={outcomes[keyOf(q)] ?? 'open'} className="space-y-1 text-body-sm">
                  <span className="mu-label">{q.label}</span>
                  <span className="block text-text">{q.question}</span>
                  <span className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-11"
                      aria-label={answering ? `Back to the field: ${q.label}` : `Answer this in ${q.label}`}
                      onClick={() => { settle(q, position, 'accepted'); goToField(q.field) }}
                    >
                      {answering ? 'Back to the field' : 'Answer this'}
                    </Button>
                    {!answering && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        aria-label={`Not now: the question about ${q.label}`}
                        onClick={() => settle(q, position, 'dismissed')}
                      >
                        Not now
                      </Button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-meta text-muted">
            {quiet || coaching ? 'Vera has nothing to ask here right now.' : 'Questions to help you decide what to write. The words stay yours.'}
          </p>
        )}
      </div>
    </section>
  )
}
