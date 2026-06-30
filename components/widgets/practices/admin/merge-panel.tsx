'use client'

// The interactive shell for Phase 2 merge suggestions (ADR-438, PRACTICE-LIBRARY §6 item 2.2).
// Thin client leaf over the self-fetching RSC (merge.tsx): lists the system's flagged duplicate
// PAIRS, lets the curator pick which practice to KEEP (the canonical) and which to FOLD IN, then
// confirms the irreversible merge behind a type-to-confirm DangerModal. The merge goes through the
// existing curator-gated mergePracticesAction, which re-points every adoption / log / tag onto the
// canonical, records a slug redirect, and archives the duplicate. Semantic tokens only; plain copy,
// no em dashes (CONTENT-VOICE).

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, ExternalLink, GitMerge } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError } from '@/lib/action-result'
import { similarityPercent } from '@/lib/practices/merge-pairs'
import { mergePracticesAction } from '@/app/(main)/admin/content/actions'

export interface MergePairRow {
  duplicateId: string
  duplicateTitle: string
  canonicalId: string
  canonicalTitle: string
  /** Cosine similarity 0-1; rendered as a "94% alike" chip. */
  similarity: number
}

/** A merge tone from the match strength: a near-identical pair is a confident merge, a looser
 *  one is a "take a closer look" nudge (the threshold is already 0.9, so most read confident). */
function alikeTone(similarity: number): StatusTone {
  return similarity >= 0.95 ? 'success' : 'warning'
}

function MergePairItem({
  row,
  disabled,
  run,
}: {
  row: MergePairRow
  disabled: boolean
  run: (fn: () => Promise<{ ok: boolean; text: string }>) => void
}) {
  // Default direction folds the duplicate (the pending submission) into the canonical (the
  // existing public practice). `flipped` swaps which one is kept for the rare reverse case.
  const [flipped, setFlipped] = useState(false)
  const [open, setOpen] = useState(false)

  const keep = flipped
    ? { id: row.duplicateId, title: row.duplicateTitle }
    : { id: row.canonicalId, title: row.canonicalTitle }
  const fold = flipped
    ? { id: row.canonicalId, title: row.canonicalTitle }
    : { id: row.duplicateId, title: row.duplicateTitle }

  function merge() {
    run(async () => {
      // mergePracticesAction(fromId, toId): `from` folds INTO `to`. We keep `keep`, fold `fold`.
      const r = await mergePracticesAction(fold.id, keep.id)
      if (isError(r)) return { ok: false, text: r.error }
      return { ok: true, text: `Merged ${fold.title} into ${keep.title}.` }
    })
  }

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            <PracticeLink id={keep.id} title={keep.title} />
            <StatusChip tone="success" size="sm">
              Keep
            </StatusChip>
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
            <PracticeLink id={fold.id} title={fold.title} />
            <StatusChip tone="neutral" size="sm">
              Fold in
            </StatusChip>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-subtle">
            <StatusChip tone={alikeTone(row.similarity)} size="sm">
              {similarityPercent(row.similarity)}% alike
            </StatusChip>
            <span>The one you keep holds its link and history.</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setFlipped((f) => !f)}
            title="Swap which practice is kept"
            aria-label="Swap which practice is kept"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-50"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden /> Swap
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            title={`Merge ${fold.title} into ${keep.title}`}
            aria-label={`Merge ${fold.title} into ${keep.title}`}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated disabled:opacity-50"
          >
            <GitMerge className="h-3.5 w-3.5" aria-hidden /> Merge
          </button>
        </div>
      </div>

      <DangerModal
        open={open}
        onClose={() => setOpen(false)}
        title="Merge practices"
        body={
          <>
            This folds <span className="font-semibold text-text">{fold.title}</span> into{' '}
            <span className="font-semibold text-text">{keep.title}</span>. Every adoption, log, and
            tag re-points onto the one you keep, the old link redirects, and the duplicate is
            archived. This cannot be undone.
          </>
        }
        confirmLabel="Merge practices"
        requireTyping={fold.title}
        onConfirm={merge}
      />
    </div>
  )
}

function PracticeLink({ id, title }: { id: string; title: string }) {
  return (
    <Link
      href={`/practices/${id}`}
      className="inline-flex min-w-0 items-center gap-1 font-medium text-text hover:underline"
    >
      <span className="min-w-0 truncate">{title}</span>
      <ExternalLink className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
    </Link>
  )
}

export function PracticeMergePanel({ rows }: { rows: MergePairRow[] }) {
  const [pending, start] = useTransition()
  const [feedback, setFeedback] = useState<{ tone: StatusTone; text: string } | null>(null)
  const router = useRouter()

  // One shared transition so two merges can't race + the whole panel disables while one is in
  // flight. Each row hands back a {ok, text} so the panel owns the single feedback line.
  function run(fn: () => Promise<{ ok: boolean; text: string }>) {
    setFeedback(null)
    start(async () => {
      const r = await fn()
      setFeedback({ tone: r.ok ? 'success' : 'danger', text: r.text })
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      {feedback && (
        <p
          role="status"
          className={`text-xs font-medium ${feedback.tone === 'danger' ? 'text-danger' : 'text-success'}`}
        >
          {feedback.text}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border bg-surface-elevated/50 px-4 py-2">
          <p className="text-xs text-muted">
            Pairs the library flagged as near-identical. Pick the one to keep, then fold the copy in.
          </p>
        </div>
        <div className="divide-y divide-border/60">
          {rows.map((row) => (
            <MergePairItem
              key={`${row.duplicateId}|${row.canonicalId}`}
              row={row}
              disabled={pending}
              run={run}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
