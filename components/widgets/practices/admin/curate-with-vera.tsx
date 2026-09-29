'use client'

// "Fill with Vera" on one needs-attention row (LIVE-644, ADR-1607). Thin client leaf over the
// curator-gated actions: ask for a draft of what the practice left empty (a card hook, tags), show
// it, and let the curator edit, accept or discard it. Nothing is written until Use this; the
// server re-checks that the hook is still empty and keeps every tag already on the practice.
// Semantic tokens only; copy is plain, no em dashes (CONTENT-VOICE).

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Sparkles, X } from 'lucide-react'
import { Label, Textarea } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import type { CurationGaps } from '@/lib/ai/practice-curate'
import { acceptPracticeCurationAction, draftPracticeCurationAction } from '@/app/(main)/admin/content/actions'

const chip =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-meta font-semibold transition-colors disabled:opacity-50'

export function CurateWithVera({ practiceId, title, gaps }: { practiceId: string; title: string; gaps: CurationGaps }) {
  const router = useRouter()
  const hookId = useId()
  const [drafting, startDraft] = useTransition()
  const [saving, startSave] = useTransition()
  const [open, setOpen] = useState(false)
  const [hook, setHook] = useState('')
  const [tags, setTags] = useState<string[]>([])
  // Fixed at draft time, so clearing the hook or dropping every tag never hides the editor.
  const [offered, setOffered] = useState({ hook: false, tags: false })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // Once the fill lands the gaps close; the confirmation line stays until the row is gone.
  if (!gaps.hook && !gaps.tags && !done) return null

  function draft() {
    setError(null)
    setDone(null)
    startDraft(async () => {
      const r = await draftPracticeCurationAction(practiceId)
      if (isError(r)) {
        setError(r.error)
        return
      }
      setHook(r.data.draft.hook ?? '')
      setTags(r.data.draft.tags)
      setOffered({ hook: r.data.draft.hook !== null, tags: r.data.draft.tags.length > 0 })
      setOpen(true)
    })
  }

  function discard() {
    setOpen(false)
    setHook('')
    setTags([])
  }

  function accept() {
    setError(null)
    startSave(async () => {
      const r = await acceptPracticeCurationAction(practiceId, { hook: hook.trim() || null, tags })
      if (isError(r)) {
        setError(r.error)
        return
      }
      const { hookWritten, hookKept, tagsAdded } = r.data.applied
      const parts: string[] = []
      if (hookWritten) parts.push('Card hook added.')
      if (hookKept) parts.push('Someone wrote a card hook first, so theirs stays.')
      if (tagsAdded > 0) parts.push(`${tagsAdded} ${tagsAdded === 1 ? 'tag' : 'tags'} added.`)
      setDone(parts.join(' ') || 'Nothing was empty anymore, so nothing changed.')
      discard()
      router.refresh()
    })
  }

  const nothing = open && !offered.hook && !offered.tags

  return (
    <div className="mt-2 space-y-2">
      {!open && (gaps.hook || gaps.tags) && (
        <button
          type="button"
          onClick={draft}
          disabled={drafting}
          title="Vera drafts only what is empty. You decide what goes in."
          aria-label={`Fill ${title} with Vera`}
          className={`${chip} text-primary-strong hover:bg-primary/10`}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {drafting ? 'Drafting…' : 'Fill with Vera'}
        </button>
      )}

      {open && (
        <div className="space-y-2 rounded-xl border border-border bg-surface-elevated/40 p-3">
          {nothing ? (
            <p className="text-meta text-muted">Vera had nothing to offer here. Fill it by hand.</p>
          ) : (
            <>
              {offered.hook && (
                <div className="space-y-1">
                  <Label htmlFor={hookId}>Card hook</Label>
                  <Textarea id={hookId} rows={2} maxLength={140} value={hook} onChange={(e) => setHook(e.target.value)} />
                </div>
              )}
              {offered.tags && tags.length > 0 && (
                <div className="space-y-1">
                  <p className="text-meta font-medium text-muted">Tags</p>
                  <ul className="flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <li key={t}>
                        <button
                          type="button"
                          onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                          aria-label={`Drop the tag ${t}`}
                          className="inline-flex items-center gap-1 rounded-pill bg-surface px-2 py-0.5 text-2xs font-semibold text-text ring-1 ring-border transition-colors hover:bg-danger-bg"
                        >
                          {t}
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-1">
            {!nothing && (
              <button
                type="button"
                onClick={accept}
                disabled={saving || (!hook.trim() && tags.length === 0)}
                className={`${chip} text-success hover:bg-success/10`}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                {saving ? 'Saving…' : 'Use this'}
              </button>
            )}
            <button type="button" onClick={discard} disabled={saving} className={`${chip} text-muted hover:text-text`}>
              <X className="h-3.5 w-3.5" aria-hidden /> Discard
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-meta text-danger">{error}</p>}
      {done && (
        <p role="status" className="text-meta text-success">
          {done}
        </p>
      )}
    </div>
  )
}
