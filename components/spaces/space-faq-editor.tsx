'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { HelpCircle, ArrowUp, ArrowDown, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Label, fieldClasses } from '@/components/ui/field'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { FormError } from '@/components/spaces/space-form'
import { createSpaceFaq, updateSpaceFaq, deleteSpaceFaq } from '@/lib/spaces/content-actions'
import { isError } from '@/lib/action-result'
import type { SpaceFaqItem } from '@/lib/spaces/content-data'

// ─────────────────────────────────────────────────────────────────────────────
// The FAQ editor — the caller that createSpaceFaq / updateSpaceFaq / deleteSpaceFaq
// never had.
//
// All three actions shipped complete, gated and tenancy-scoped, and nothing in the product
// called them. Meanwhile the READ path was fully live: the SpaceFAQ Puck block renders these
// rows and emits FAQPage JSON-LD from them, and 62 rows exist across 14 Spaces. So FAQs could
// be seeded by the bulk importer and shown to the public, and an operator could never add,
// edit or remove one.
//
// This lives on /spaces/<slug>/settings/basics because the repo had already decided it did:
// lib/entity-blocks/block-data-sources.ts:344 maps block `faq` to moduleId `space.basics` with
// createLabel 'Add a question', so the empty-state CTA already pointed here. The page just had
// no editor to point at. Same shape as the Info & Connect fix recorded in that page's own
// comment, which was this bug one audit earlier.
//
// Per-row writes rather than a replace-set: each row is an independent entity with its own id,
// and a replace-set would churn ids the FAQPage schema is built from.
// ─────────────────────────────────────────────────────────────────────────────

type Draft = { id?: string; question: string; answer: string; dirty: boolean }

export function SpaceFaqEditor({
  slug,
  initialFaqs,
  readOnly = false,
}: {
  slug: string
  initialFaqs: readonly SpaceFaqItem[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Draft[]>(() =>
    initialFaqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer, dirty: false })),
  )
  const [error, setError] = useState('')
  const [pendingIndex, setPendingIndex] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const patch = (i: number, next: Partial<Draft>) =>
    setRows((prev) => prev.map((r, n) => (n === i ? { ...r, ...next, dirty: true } : r)))

  const save = (i: number) => {
    const row = rows[i]
    if (!row) return
    setError('')
    setPendingIndex(i)
    startTransition(async () => {
      // Branched rather than a ternary: create and update return different ActionResult
      // payloads (`{id}` vs void), and collapsing them loses the new id.
      let newId = row.id
      if (row.id) {
        const res = await updateSpaceFaq(slug, row.id, { question: row.question, answer: row.answer })
        setPendingIndex(null)
        if (isError(res)) {
          setError(res.error)
          return
        }
      } else {
        const res = await createSpaceFaq(slug, { question: row.question, answer: row.answer })
        setPendingIndex(null)
        if (isError(res)) {
          setError(res.error)
          return
        }
        // Stamp the new id so the NEXT save updates this row rather than creating a duplicate.
        newId = res.data.id
      }
      setRows((prev) => prev.map((r, n) => (n === i ? { ...r, id: newId, dirty: false } : r)))
      router.refresh()
    })
  }

  const remove = (i: number) => {
    const row = rows[i]
    if (!row) return
    // A draft that was never saved has no server row to delete.
    if (!row.id) {
      setRows((prev) => prev.filter((_, n) => n !== i))
      return
    }
    setError('')
    setPendingIndex(i)
    startTransition(async () => {
      const res = await deleteSpaceFaq(slug, row.id as string)
      setPendingIndex(null)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setRows((prev) => prev.filter((_, n) => n !== i))
      router.refresh()
    })
  }

  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta
    if (j < 0 || j >= rows.length) return
    const a = rows[i]
    const b = rows[j]
    if (!a || !b) return
    // Optimistic: swap locally first, revert if either write fails. Reordering is the one
    // action here that is safe to show before it lands -- it cannot fail validation.
    const before = rows
    setRows((prev) => {
      const next = [...prev]
      next[i] = b
      next[j] = a
      return next
    })
    setError('')
    startTransition(async () => {
      // Skip any row that has never been saved: it has no id to position.
      const writes = [
        a.id ? updateSpaceFaq(slug, a.id, { position: j }) : null,
        b.id ? updateSpaceFaq(slug, b.id, { position: i }) : null,
      ].filter(Boolean) as Promise<unknown>[]
      const results = await Promise.all(writes)
      if (results.some((r) => isError(r as never))) {
        setRows(before)
        setError('Could not reorder those. Try again.')
        return
      }
      router.refresh()
    })
  }

  const add = () =>
    setRows((prev) => [...prev, { question: '', answer: '', dirty: true }])

  const addButton = (
    <Button size="sm" variant="secondary" onClick={add} disabled={readOnly}>
      Add a question
    </Button>
  )

  return (
    <section aria-labelledby="space-faq-heading">
      <SectionHeader title="Common questions" count={rows.length} action={readOnly ? undefined : addButton} />

      {error && <FormError message={error} />}

      {rows.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No questions yet"
          description="Answer what people ask before they get in touch. Each one shows on your Space page and helps you turn up in search."
          action={readOnly ? undefined : addButton}
        />
      ) : (
        <ol className="space-y-3">
          {rows.map((row, i) => {
            const busy = isPending && pendingIndex === i
            return (
              <li key={row.id ?? `draft-${i}`}>
                <article
                  aria-busy={busy}
                  className={`rounded-card border border-border bg-surface p-4 ${busy ? 'dimmed' : ''}`}
                >
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor={`faq-q-${i}`}>Question</Label>
                      <input
                        id={`faq-q-${i}`}
                        className={fieldClasses}
                        value={row.question}
                        onChange={(e) => patch(i, { question: e.target.value })}
                        disabled={readOnly || busy}
                        maxLength={500}
                        placeholder="What do people ask you most?"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`faq-a-${i}`}>Answer</Label>
                      <textarea
                        id={`faq-a-${i}`}
                        className={fieldClasses}
                        rows={3}
                        value={row.answer}
                        onChange={(e) => patch(i, { answer: e.target.value })}
                        disabled={readOnly || busy}
                        maxLength={5000}
                        placeholder="Answer it the way you would in person."
                      />
                    </div>
                  </div>

                  {!readOnly && (
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <IconButton
                        label="Move this question up"
                        onClick={() => move(i, -1)}
                        disabled={i === 0 || busy}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Move this question down"
                        onClick={() => move(i, 1)}
                        disabled={i === rows.length - 1 || busy}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </IconButton>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => save(i)}
                        disabled={!row.dirty || busy}
                      >
                        Save
                      </Button>
                      <IconButton
                        label="Remove this question"
                        tone="danger"
                        onClick={() => remove(i)}
                        disabled={busy}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  )}
                </article>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
