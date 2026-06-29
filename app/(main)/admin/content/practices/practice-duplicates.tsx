'use client'

// The explicit per-practice "find near-duplicates" affordance (PRACTICE-LIBRARY §5). Pairwise
// similarity over the whole library is expensive, so this is NOT an always-on column — it's a
// button the operator triggers on one row, which runs the vector lookup and lists the nearest
// matches in a small dialog. Empty result = "nothing close" (or the practice has no embedding
// yet); the operator opens a match to compare and decide on a merge by hand (merge is Phase 2).

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CopyCheck, ExternalLink, GitMerge } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError } from '@/lib/action-result'
import type { DuplicateCandidate } from '@/lib/practices'
import { findPracticeDuplicatesAction, mergePracticesAction } from '../actions'

// One near-duplicate row: open it to compare, OR merge it INTO the practice being viewed (the
// canonical you keep). Merge is irreversible (it re-points every adoption + log + tag onto the
// canonical and records a slug redirect), so it sits behind a type-to-confirm DangerModal.
function DuplicateRow({
  candidate,
  canonicalId,
  canonicalTitle,
  onMerged,
  onError,
}: {
  candidate: DuplicateCandidate
  canonicalId: string
  canonicalTitle: string
  onMerged: (text: string) => void
  onError: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  function merge() {
    start(async () => {
      // The viewed practice is the canonical (the "one you're viewing"); the candidate folds in.
      const r = await mergePracticesAction(candidate.id, canonicalId)
      if (isError(r)) onError(r.error)
      else {
        onMerged(`Merged ${candidate.title} into ${canonicalTitle}.`)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
      <span className="min-w-0 truncate text-sm font-medium text-text">{candidate.title}</span>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs tabular-nums text-muted">{Math.round(candidate.similarity * 100)}% alike</span>
        <Link
          href={`/practices/${candidate.id}/edit`}
          title="Open"
          aria-label={`Open ${candidate.title}`}
          className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(true)}
          title={`Merge ${candidate.title} into ${canonicalTitle}`}
          aria-label={`Merge ${candidate.title} into the one you are viewing`}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated disabled:opacity-50"
        >
          <GitMerge className="h-3.5 w-3.5" aria-hidden /> Merge in
        </button>
      </div>
      <DangerModal
        open={open}
        onClose={() => setOpen(false)}
        title="Merge practices"
        body={
          <>
            This folds <span className="font-semibold text-text">{candidate.title}</span> into{' '}
            <span className="font-semibold text-text">{canonicalTitle}</span>. Every adoption, log,
            and tag re-points onto the one you keep, the old link redirects, and the duplicate is
            archived. This cannot be undone.
          </>
        }
        confirmLabel="Merge practices"
        requireTyping={candidate.title}
        onConfirm={merge}
      />
    </div>
  )
}

export function PracticeDuplicatesButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<DuplicateCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  function check() {
    setOpen(true)
    setResult(null)
    setError(null)
    setFeedback(null)
    start(async () => {
      const r = await findPracticeDuplicatesAction(id)
      if (isError(r)) setError(r.error)
      else setResult(r.data.candidates)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={check}
        title={`Find near-duplicates of ${title}`}
        aria-label={`Find near-duplicates of ${title}`}
        className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <CopyCheck className="h-4 w-4" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Near-duplicates" className="max-w-lg">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-pop">
        <h2 className="text-base font-bold text-text">Near-duplicates</h2>
        <p className="mt-1 text-sm text-muted">
          Practices that read close to <span className="font-medium text-text">{title}</span>. Merge
          one in to keep this as the canonical.
        </p>
        {feedback && (
          <p role="status" className={`mt-2 text-sm font-medium ${feedback.ok ? 'text-success' : 'text-danger'}`}>
            {feedback.text}
          </p>
        )}
        <div className="mt-3 space-y-2">
          {pending && !result && <p className="text-sm text-subtle">Checking the library…</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          {result && result.length === 0 && (
            <p className="text-sm text-subtle">
              Nothing close. Either this practice stands on its own, or its match data is still
              warming up.
            </p>
          )}
          {result?.map((c) => (
            <DuplicateRow
              key={c.id}
              candidate={c}
              canonicalId={id}
              canonicalTitle={title}
              onMerged={(text) => {
                setFeedback({ ok: true, text })
                setResult((prev) => (prev ? prev.filter((r) => r.id !== c.id) : prev))
              }}
              onError={(text) => setFeedback({ ok: false, text })}
            />
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
          >
            Close
          </button>
        </div>
        </div>
      </Dialog>
    </>
  )
}
