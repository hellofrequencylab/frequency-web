'use client'

// The interactive shell for the Phase 2 review queue (ADR-438, PRACTICE-LIBRARY §6 item 2.1).
// Thin client leaf over the self-fetching RSC (review-queue.tsx): owns multi-select + the bulk
// approve/reject bar, the per-row Approve/Reject, and the advisory "Pre-screen (Vera)" panel.
// Every mutation goes through the existing curator-gated actions; the screen is ADVISORY and
// never blocks a decision. Semantic tokens only; copy is plain, no em dashes (CONTENT-VOICE).

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, X, ExternalLink, Sparkles, CopyCheck, ShieldAlert } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import type { PracticeScreenResult } from '@/lib/ai/practice-publish-screen'
import {
  bulkReviewAction,
  setPracticeStatusAction,
  screenPracticeAction,
} from '@/app/(main)/admin/content/actions'

export interface ReviewRow {
  id: string
  title: string
  creator: string
  /** No member creator: a Frequency house practice. */
  isHouse: boolean
  submitterTrust: number
  updatedAt: string
  possibleDuplicateOf: { id: string; title: string; similarity: number } | null
}

/** A short "2 days ago" style relative time (no library; plain + stable). */
function ago(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const s = Math.max(0, (Date.now() - then) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.round(d / 30)
  return `${mo}mo ago`
}

/** A submitter-trust hint. Trust is zero for everyone today (the ledger is not yet wired,
 *  Phase 3), so this only speaks up once a real signal lands. */
function trustHint(trust: number): { tone: StatusTone; label: string } | null {
  if (trust <= 0) return null
  if (trust < 30) return { tone: 'warning', label: 'New submitter' }
  if (trust >= 70) return { tone: 'success', label: 'Trusted submitter' }
  return { tone: 'neutral', label: 'Known submitter' }
}

function ScreenPanel({ screen }: { screen: PracticeScreenResult }) {
  const groups: { label: string; notes: string[]; tone: StatusTone }[] = [
    { label: 'Voice', notes: screen.voice, tone: 'info' },
    { label: 'Completeness', notes: screen.completeness, tone: 'neutral' },
    { label: 'Safety', notes: screen.safety, tone: 'danger' },
  ]
  const anything = groups.some((g) => g.notes.length > 0)
  return (
    <div className="mt-2 rounded-xl border border-border bg-surface-elevated/60 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="text-xs font-semibold text-text">Vera read</span>
        <StatusChip tone={screen.ok ? 'success' : 'warning'} size="sm">
          {screen.ok ? `Looks ready · ${screen.score}` : `Take a look · ${screen.score}`}
        </StatusChip>
        {screen.safety.length > 0 && (
          <span className="inline-flex items-center gap-1 text-2xs font-semibold text-danger">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Safety note
          </span>
        )}
      </div>
      <p className="mt-1 text-2xs text-subtle">Advice only. You still make the call.</p>
      {anything ? (
        <div className="mt-2 space-y-2">
          {groups
            .filter((g) => g.notes.length > 0)
            .map((g) => (
              <div key={g.label}>
                <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">{g.label}</p>
                <ul className="mt-0.5 space-y-0.5">
                  {g.notes.map((n, i) => (
                    <li key={i} className="text-xs text-muted">
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Nothing flagged. Reads clean on voice, completeness, and safety.</p>
      )}
    </div>
  )
}

function ReviewRowItem({
  row,
  checked,
  onToggle,
  busy,
}: {
  row: ReviewRow
  checked: boolean
  onToggle: (checked: boolean) => void
  busy: boolean
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<PracticeScreenResult | null>(null)
  const [screening, startScreen] = useTransition()
  const router = useRouter()
  const trust = trustHint(row.submitterTrust)
  const disabled = busy || pending

  function decide(status: 'approved' | 'rejected') {
    setError(null)
    start(async () => {
      const r = await setPracticeStatusAction(row.id, status)
      if (isError(r)) setError(r.error)
      else router.refresh()
    })
  }

  function prescreen() {
    setError(null)
    startScreen(async () => {
      const r = await screenPracticeAction(row.id)
      if (isError(r)) setError(r.error)
      else setScreen(r.data.screen)
    })
  }

  return (
    <div className={`px-4 py-3 ${checked ? 'bg-primary/5' : ''}`}>
      <div className="flex flex-wrap items-start gap-3">
        <label className="-my-1 flex h-9 w-9 cursor-pointer items-center justify-center sm:my-0 sm:h-auto sm:w-auto">
          <span className="sr-only">Select {row.title}</span>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-border-strong text-primary focus:ring-2 focus:ring-primary/50"
          />
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/practices/${row.id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-text hover:underline"
            >
              <span className="min-w-0 truncate">{row.title}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
            </Link>
            {row.isHouse && (
              <StatusChip tone="info" size="sm">
                House
              </StatusChip>
            )}
            {row.possibleDuplicateOf && (
              <Link
                href={`/practices/${row.possibleDuplicateOf.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-2xs font-semibold text-warning transition-opacity hover:opacity-80"
                title="A near-identical practice already exists"
              >
                <CopyCheck className="h-3 w-3" aria-hidden />
                Possible duplicate of {row.possibleDuplicateOf.title} (
                {Math.round(row.possibleDuplicateOf.similarity * 100)}% alike)
              </Link>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
            <span>by {row.creator}</span>
            <span aria-hidden>·</span>
            <span>{ago(row.updatedAt)}</span>
            {trust && (
              <>
                <span aria-hidden>·</span>
                <StatusChip tone={trust.tone} size="sm">
                  {trust.label}
                </StatusChip>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={prescreen}
            disabled={screening || disabled}
            title="Pre-screen with Vera (advisory)"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-primary-strong transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {screening ? 'Reading…' : 'Pre-screen'}
          </button>
          <button
            type="button"
            onClick={() => decide('approved')}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/10 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> Approve
          </button>
          <button
            type="button"
            onClick={() => decide('rejected')}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Reject
          </button>
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {screen && <ScreenPanel screen={screen} />}
    </div>
  )
}

export function ReviewQueuePanel({ rows }: { rows: ReviewRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [feedback, setFeedback] = useState<{ tone: StatusTone; text: string } | null>(null)
  const router = useRouter()

  const ids = rows.map((r) => r.id)
  const allSelected = rows.length > 0 && ids.every((id) => selected.has(id))
  const someSelected = selected.size > 0 && !allSelected

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(ids) : new Set())
  }

  function bulkReview(decision: 'approved' | 'rejected') {
    if (selected.size === 0) return
    setFeedback(null)
    start(async () => {
      const r = await bulkReviewAction([...selected], decision)
      if (isError(r)) setFeedback({ tone: 'danger', text: r.error })
      else {
        const n = r.data.count
        const verb = decision === 'approved' ? 'Approved' : 'Rejected'
        setFeedback({ tone: 'success', text: `${verb} ${n} ${n === 1 ? 'practice' : 'practices'}.` })
        setSelected(new Set())
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk review"
          className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-surface-elevated px-3 py-2 shadow-sm"
        >
          <span className="text-sm font-semibold text-text">{selected.size} selected</span>
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
          <button
            type="button"
            disabled={pending}
            onClick={() => bulkReview('approved')}
            className="inline-flex min-h-[2rem] items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/10 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> Approve selected
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => bulkReview('rejected')}
            className="inline-flex min-h-[2rem] items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Reject selected
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex min-h-[2rem] items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-text"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Clear
          </button>
        </div>
      )}

      {feedback && (
        <p
          role="status"
          className={`text-xs font-medium ${feedback.tone === 'danger' ? 'text-danger' : 'text-success'}`}
        >
          {feedback.text}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border bg-surface-elevated/50 px-4 py-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected
              }}
              onChange={(e) => toggleAll(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-border-strong text-primary focus:ring-2 focus:ring-primary/50"
            />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Select all</span>
          </label>
        </div>
        <div className="divide-y divide-border/60">
          {rows.map((row) => (
            <ReviewRowItem
              key={row.id}
              row={row}
              checked={selected.has(row.id)}
              onToggle={(c) => toggleRow(row.id, c)}
              busy={pending}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
