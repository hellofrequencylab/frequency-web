'use client'

// The interactive shell for Phase 2 tag governance (ADR-438, PRACTICE-LIBRARY §6 item 2.4).
// Thin client leaf over the self-fetching RSC (tag-governance.tsx): lists canonical + member or
// Vera-proposed tags with usage counts, promotes a proposed tag to canonical, and folds a
// synonym INTO a canonical tag (a confirmed, re-pointing merge). Every mutation goes through the
// existing curator-gated actions. Semantic tokens only; plain copy, no em dashes (CONTENT-VOICE).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError } from '@/lib/action-result'
import { promoteTagAction, mergeTagsAction } from '@/app/(main)/admin/content/actions'

export interface TagRow {
  id: string
  label: string
  isCanonical: boolean
  usageCount: number
  /** Where the links came from: 'author' | 'member' | 'vera' | 'mixed' | null. */
  source: string | null
}

const SOURCE_LABEL: Record<string, string> = {
  author: 'By the creator',
  member: 'Member-proposed',
  vera: 'From Vera',
  mixed: 'Mixed sources',
}

/** The merge confirm: pick a canonical target, then a type-to-confirm before the re-point. */
function MergeControl({
  tag,
  targets,
  disabled,
  run,
}: {
  tag: TagRow
  targets: { id: string; label: string }[]
  disabled: boolean
  run: (fn: () => Promise<{ ok: boolean; text: string }>) => void
}) {
  const [intoId, setIntoId] = useState('')
  const [open, setOpen] = useState(false)
  const choices = targets.filter((t) => t.id !== tag.id)
  const intoLabel = choices.find((t) => t.id === intoId)?.label ?? ''

  function merge() {
    run(async () => {
      const r = await mergeTagsAction(tag.id, intoId)
      if (isError(r)) return { ok: false, text: r.error }
      const { repointed, dropped } = r.data.result
      return {
        ok: true,
        text: `Merged ${tag.label} into ${intoLabel}. Re-pointed ${repointed}, dropped ${dropped} that already had it.`,
      }
    })
  }

  if (choices.length === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor={`merge-${tag.id}`}>
        Merge {tag.label} into
      </label>
      <select
        id={`merge-${tag.id}`}
        value={intoId}
        disabled={disabled}
        onChange={(e) => setIntoId(e.target.value)}
        className="h-8 max-w-36 rounded-lg border border-border bg-surface px-2 text-xs text-text focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
      >
        <option value="">Merge into…</option>
        {choices.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled || !intoId}
        onClick={() => setOpen(true)}
        title={`Merge ${tag.label} into ${intoLabel}`}
        aria-label={`Merge ${tag.label} into the chosen tag`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
      <DangerModal
        open={open}
        onClose={() => setOpen(false)}
        title="Merge tags"
        body={
          <>
            This folds <span className="font-semibold text-text">{tag.label}</span> into{' '}
            <span className="font-semibold text-text">{intoLabel}</span>. Every practice carrying it
            moves to the canonical tag, and {tag.label} is retired. This cannot be undone.
          </>
        }
        confirmLabel="Merge tags"
        requireTyping={tag.label}
        onConfirm={merge}
      />
    </div>
  )
}

function PromoteButton({
  tag,
  disabled,
  run,
}: {
  tag: TagRow
  disabled: boolean
  run: (fn: () => Promise<{ ok: boolean; text: string }>) => void
}) {
  function promote() {
    run(async () => {
      const r = await promoteTagAction(tag.id)
      if (isError(r)) return { ok: false, text: r.error }
      return { ok: true, text: `Promoted ${tag.label} to canonical.` }
    })
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={promote}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-primary-strong transition-colors hover:bg-primary/10 disabled:opacity-50"
    >
      <Check className="h-3.5 w-3.5" aria-hidden /> Promote
    </button>
  )
}

export function TagGovernancePanel({
  rows,
  canonicalTargets,
}: {
  rows: TagRow[]
  canonicalTargets: { id: string; label: string }[]
}) {
  const [pending, start] = useTransition()
  const [feedback, setFeedback] = useState<{ tone: StatusTone; text: string } | null>(null)
  const router = useRouter()

  // One shared transition for every mutation so two writes can't race + the whole panel disables
  // while one is in flight. Each control hands back a {ok, text} so the panel owns the feedback line.
  function run(fn: () => Promise<{ ok: boolean; text: string }>) {
    setFeedback(null)
    start(async () => {
      const r = await fn()
      setFeedback({ tone: r.ok ? 'success' : 'danger', text: r.text })
      if (r.ok) router.refresh()
    })
  }

  const canonical = rows.filter((t) => t.isCanonical)
  const proposed = rows.filter((t) => !t.isCanonical)

  return (
    <div className="space-y-3">
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
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Canonical tags
            <span className="ml-1.5 font-medium tabular-nums text-subtle">{canonical.length}</span>
          </p>
        </div>
        <div className="divide-y divide-border/60">
          {canonical.length === 0 ? (
            <p className="px-4 py-3 text-xs text-subtle">No canonical tags yet. Promote a proposed tag below.</p>
          ) : (
            canonical.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{t.label}</span>
                <span className="text-xs tabular-nums text-subtle">
                  {t.usageCount} {t.usageCount === 1 ? 'practice' : 'practices'}
                </span>
                <StatusChip tone="success" size="sm">
                  Canonical
                </StatusChip>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border bg-surface-elevated/50 px-4 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Proposed tags
            <span className="ml-1.5 font-medium tabular-nums text-subtle">{proposed.length}</span>
          </p>
        </div>
        <div className="divide-y divide-border/60">
          {proposed.length === 0 ? (
            <p className="px-4 py-3 text-xs text-subtle">Nothing waiting. Every tag is canonical.</p>
          ) : (
            proposed.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">{t.label}</span>
                  <span className="text-2xs text-subtle">
                    {t.usageCount} {t.usageCount === 1 ? 'practice' : 'practices'}
                    {t.source && SOURCE_LABEL[t.source] ? ` · ${SOURCE_LABEL[t.source]}` : ''}
                  </span>
                </div>
                <MergeControl tag={t} targets={canonicalTargets} disabled={pending} run={run} />
                <PromoteButton tag={t} disabled={pending} run={run} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
