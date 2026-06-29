'use client'

// ── 1.8 DataTable decision (ADR-438) ──────────────────────────────────────────
// This surface KEEPS A BESPOKE row body rather than rendering through the shared
// components/admin/data-table.tsx. DataTable is a server-safe, presentational table whose
// contract is "the page sorts/filters/paginates server-side and hands ready rows in" — which
// this page now does — but its row model has no place for the three things this table needs at
// the row level: a leading SELECTION checkbox column, a per-column MASTER SWITCH in the header
// (flip Public for the whole filtered set in one tap), and per-row interactive client toggles
// (Public / Feature) that carry their own optimistic state. DataTable's cells are server-rendered
// and it owns no selection state. Forcing those through it would mean a checkbox "column" that
// fakes the contract plus a client wrapper that re-implements selection anyway — strictly more
// code than the bespoke grid below for no reuse win. So: filtering / sorting / paging are now
// SERVER-owned (URL params drive the page's fetch; this component renders the page it is handed),
// and this thin CLIENT wrapper owns ONLY selection state + the bulk bar + the pagination control.
// It speaks the shared StatusChip vocabulary and uses semantic tokens only. If a future operator
// table needs the same checkbox + master-switch + per-row-toggle shape, the right move is to add a
// `selection` slot to DataTable (a documented follow-up), not to fork this.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, X, Pencil, Trash2, Archive, RotateCcw } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import { DangerModal } from '@/components/admin/danger-modal'
import { deletePracticeAction } from '@/app/(main)/practices/actions'
import {
  setAllPracticeFlagsAction,
  bulkUpdatePracticesAction,
  archivePracticesAction,
  restorePracticesAction,
  bulkPracticesByFilterAction,
  type BulkFilteredOp,
} from '../actions'
import { PracticeFeatureToggle, PracticePublicToggle } from '../content-controls'
import { PracticeDuplicatesButton } from './practice-duplicates'

export interface LibraryRow {
  id: string
  title: string
  creator: string
  status: string
  adopters: number
  logs_30d: number
  logs_total: number
  score: number
  created_at: string
  is_public: boolean
  is_template: boolean
  featured: boolean
  /** Payout tier ('light' | 'standard' | 'heavy'), or null when unset. */
  weight_class: string | null
}

/** The active filter, mirrored from the URL, so a bulk action can run on the WHOLE filtered set
 *  (the server re-runs the identical query). A plain serializable object — no functions cross the
 *  boundary. Keys match AdminPracticeSearchOpts; the page builds it from searchParams. */
export type LibraryFilter = Record<string, string | number | boolean | null | undefined>

const STATUS_TONE: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: 'info', label: 'Pending' },
  approved: { tone: 'success', label: 'Approved' },
  rejected: { tone: 'danger', label: 'Rejected' },
  draft: { tone: 'neutral', label: 'Draft' },
  archived: { tone: 'neutral', label: 'Archived' },
}

const WEIGHT_META: Record<string, { tone: StatusTone; label: string }> = {
  light: { tone: 'neutral', label: 'Light' },
  standard: { tone: 'info', label: 'Standard' },
  heavy: { tone: 'warning', label: 'Heavy' },
}

// The lean management grid (8 cols): checkbox · Practice (+ weight chip) · Creator · Usage ·
// Status · Public · Feature · Manage. The raw stat spread (adopters / total / added) folds into
// one Usage cell; weight is a quiet read-only chip (it becomes auto-computed, ADR-438); template
// lives in the bulk bar.
const GRID = 'lg:grid-cols-[36px_1fr_128px_112px_104px_72px_56px_88px]'

function PlainHeader({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <span className={`block text-xs font-semibold uppercase tracking-wide text-muted ${center ? 'text-center' : ''}`}>
      {children}
    </span>
  )
}

// The bulk master switch: on when every row in view is on; one tap flips them all.
function MasterSwitch({
  on, label, count, disabled, onToggle,
}: {
  on: boolean
  label: string
  count: number
  disabled: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(!on)}
      title={`Turn ${label} ${on ? 'off' : 'on'} for all ${count} in view`}
      aria-label={`All ${label} ${on ? 'off' : 'on'}`}
      className={`relative mx-auto mt-1 block h-3.5 w-7 rounded-full transition-colors disabled:opacity-50 motion-reduce:transition-none ${
        on ? 'bg-primary' : 'bg-border-strong'
      }`}
    >
      <span
        className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-surface shadow transition-all motion-reduce:transition-none ${
          on ? 'left-4' : 'left-0.5'
        }`}
      />
    </button>
  )
}

/** A 44px-target checkbox for multi-select. Keyboard-reachable (a real input). */
function RowCheckbox({
  checked, indeterminate = false, onChange, label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="-my-3 flex h-11 w-11 cursor-pointer items-center justify-center lg:my-0 lg:h-auto lg:w-auto">
      <span className="sr-only">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate
        }}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded border-border-strong text-primary focus:ring-2 focus:ring-primary/50"
      />
    </label>
  )
}

// Per-row management: a full-page Edit (the shared builder at /practices/[id]/edit) + a guarded
// Delete (type-to-confirm; deletePractice is irreversible + admin-gated server-side) + the
// explicit "find near-duplicates" lookup (PRACTICE-LIBRARY §5: NOT an always-on column).
function PracticeRowActions({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  function remove() {
    start(async () => {
      const r = await deletePracticeAction(id)
      if (!isError(r)) router.refresh()
    })
  }

  return (
    <div className="hidden items-center justify-center gap-0.5 lg:flex">
      <PracticeDuplicatesButton id={id} title={title} />
      <Link
        href={`/practices/${id}/edit`}
        title={`Edit ${title}`}
        aria-label={`Edit ${title}`}
        className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <Pencil className="h-4 w-4" />
      </Link>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        title={`Delete ${title}`}
        aria-label={`Delete ${title}`}
        className="rounded-md p-1 text-subtle transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <DangerModal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete practice"
        body={
          <>
            This removes <span className="font-semibold text-text">{title}</span> from the library for
            everyone, along with its logs and adoptions. This cannot be undone.
          </>
        }
        confirmLabel="Delete practice"
        requireTyping={title}
        onConfirm={remove}
      />
    </div>
  )
}

export function PracticesTable({
  rows,
  filter,
  total,
  showingFrom,
  showingTo,
  pagination,
}: {
  rows: LibraryRow[]
  /** The current filter, mirrored from the URL — drives the "act on the whole filtered set" path. */
  filter: LibraryFilter
  /** Exact count of the whole filtered set (countAdminPractices). */
  total: number
  showingFrom: number
  showingTo: number
  /** Server pagination: a keyset "Load more" href (score sort) OR prev/next page hrefs. */
  pagination:
    | { kind: 'cursor'; moreHref: string | null }
    | { kind: 'page'; prevHref: string | null; nextHref: string | null; page: number; pageCount: number }
}) {
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<{ tone: StatusTone; text: string } | null>(null)
  const router = useRouter()

  const allPublic = rows.length > 0 && rows.every((r) => r.is_public)
  const pageIds = rows.map((r) => r.id)
  const allSelected = rows.length > 0 && pageIds.every((id) => selected.has(id))
  const someSelected = selected.size > 0 && !allSelected
  // The selection can span pages, but the bulk bar acts on whatever is currently checked.
  const selectedCount = selected.size
  // True when the operator wants to reach beyond the loaded page (more rows match than are shown).
  const moreThanPage = total > rows.length

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of pageIds) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  // The header master switch: flip a flag for the WHOLE filtered set (not just the loaded page).
  // Routes through bulkPracticesByFilterAction so it reaches every match, capped server-side.
  function masterFlag(flag: 'is_public', value: boolean) {
    setFeedback(null)
    start(async () => {
      const r = await bulkPracticesByFilterAction(filter, { kind: 'setFlag', flag, value })
      if (isError(r)) setFeedback({ tone: 'danger', text: r.error })
      else {
        setFeedback({ tone: 'success', text: resultLine(value ? 'Published' : 'Unpublished', r.data) })
        router.refresh()
      }
    })
  }

  function resultLine(verb: string, data: { count: number; capped: boolean }) {
    const noun = data.count === 1 ? 'practice' : 'practices'
    return data.capped
      ? `${verb} ${data.count} ${noun} (capped — refine the filter to reach the rest).`
      : `${verb} ${data.count} ${noun}.`
  }

  // --- The selected-ids bulk path (acts on exactly the checked rows) ---
  function runSelected(
    fn: () => Promise<{ ok: boolean; count?: number; error?: string }>,
    verb: string,
  ) {
    if (selectedCount === 0) return
    setFeedback(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) setFeedback({ tone: 'danger', text: r.error ?? 'Could not update the practices.' })
      else {
        const n = r.count ?? selectedCount
        setFeedback({ tone: 'success', text: `${verb} ${n} ${n === 1 ? 'practice' : 'practices'}.` })
        setSelected(new Set())
        router.refresh()
      }
    })
  }

  function bulkWeight(weightClass: 'light' | 'standard' | 'heavy') {
    runSelected(async () => {
      const r = await bulkUpdatePracticesAction([...selected], { weightClass })
      return isError(r) ? { ok: false, error: r.error } : { ok: true, count: r.data.count }
    }, `Set ${WEIGHT_META[weightClass].label} for`)
  }

  function bulkPublic(value: boolean) {
    runSelected(async () => {
      const r = await bulkUpdatePracticesAction([...selected], { isPublic: value })
      return isError(r) ? { ok: false, error: r.error } : { ok: true, count: r.data.count }
    }, value ? 'Published' : 'Unpublished')
  }

  function bulkTemplate(value: boolean) {
    runSelected(async () => {
      const r = await setAllPracticeFlagsAction([...selected], 'is_template', value)
      return isError(r) ? { ok: false, error: r.error } : { ok: true }
    }, value ? 'Marked template for' : 'Unmarked template for')
  }

  function bulkArchive() {
    runSelected(async () => {
      const r = await archivePracticesAction([...selected])
      return isError(r) ? { ok: false, error: r.error } : { ok: true, count: r.data.count }
    }, 'Archived')
  }

  function bulkRestore() {
    runSelected(async () => {
      const r = await restorePracticesAction([...selected])
      return isError(r) ? { ok: false, error: r.error } : { ok: true, count: r.data.count }
    }, 'Restored')
  }

  // --- The whole-filtered-set bulk path (acts on every match, capped server-side) ---
  function runFiltered(op: BulkFilteredOp, verb: string) {
    setFeedback(null)
    start(async () => {
      const r = await bulkPracticesByFilterAction(filter, op)
      if (isError(r)) setFeedback({ tone: 'danger', text: r.error })
      else {
        setFeedback({ tone: 'success', text: resultLine(verb, r.data) })
        setSelected(new Set())
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* Contextual bulk-action bar — appears only when rows are selected (NN/g). */}
      {selectedCount > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-surface-elevated px-3 py-2 shadow-sm"
        >
          <span className="text-sm font-semibold text-text">{selectedCount} selected</span>
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />

          <span className="text-xs font-medium text-muted">Weight</span>
          {(['light', 'standard', 'heavy'] as const).map((w) => (
            <button
              key={w}
              type="button"
              disabled={pending}
              onClick={() => bulkWeight(w)}
              className="inline-flex min-h-[2rem] items-center rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface disabled:opacity-50 motion-reduce:transition-none"
            >
              {WEIGHT_META[w].label}
            </button>
          ))}

          <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
          <button
            type="button"
            disabled={pending}
            onClick={() => bulkPublic(true)}
            className="inline-flex min-h-[2rem] items-center rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/10 disabled:opacity-50 motion-reduce:transition-none"
          >
            Publish
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => bulkPublic(false)}
            className="inline-flex min-h-[2rem] items-center rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface disabled:opacity-50 motion-reduce:transition-none"
          >
            Unpublish
          </button>

          <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
          <span className="text-xs font-medium text-muted">Template</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => bulkTemplate(true)}
            className="inline-flex min-h-[2rem] items-center rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface disabled:opacity-50 motion-reduce:transition-none"
          >
            On
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => bulkTemplate(false)}
            className="inline-flex min-h-[2rem] items-center rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface disabled:opacity-50 motion-reduce:transition-none"
          >
            Off
          </button>

          <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
          <button
            type="button"
            disabled={pending}
            onClick={bulkArchive}
            className="inline-flex min-h-[2rem] items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface disabled:opacity-50 motion-reduce:transition-none"
          >
            <Archive className="h-3.5 w-3.5" aria-hidden /> Archive
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={bulkRestore}
            className="inline-flex min-h-[2rem] items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface disabled:opacity-50 motion-reduce:transition-none"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restore
          </button>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex min-h-[2rem] items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-text motion-reduce:transition-none"
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

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-xs text-muted">
          {total === 0 ? 'No practices match' : `Showing ${showingFrom}–${showingTo} of ${total}`}
        </span>
        {/* Reach past the loaded page: apply a bulk op to EVERY match of the current filter. */}
        {moreThanPage && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-subtle">All {total} matching:</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => runFiltered({ kind: 'setFlag', flag: 'is_public', value: true }, 'Published')}
              className="inline-flex items-center rounded-lg border border-border px-2 py-0.5 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-50"
            >
              Publish all
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => runFiltered({ kind: 'archive' }, 'Archived')}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-50"
            >
              <Archive className="h-3 w-3" aria-hidden /> Archive all
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => runFiltered({ kind: 'restore' }, 'Restored')}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Restore all
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className={`hidden border-b border-border bg-surface-elevated/50 px-4 py-2 lg:grid ${GRID} lg:items-center lg:gap-2.5`}>
          <RowCheckbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={toggleAll}
            label="Select all practices in view"
          />
          <PlainHeader>Practice</PlainHeader>
          <PlainHeader>Creator</PlainHeader>
          <PlainHeader center>Usage</PlainHeader>
          <PlainHeader>Status</PlainHeader>
          <div className="text-center">
            <PlainHeader center>Public</PlainHeader>
            <MasterSwitch on={allPublic} label="Public" count={total} disabled={pending} onToggle={(v) => masterFlag('is_public', v)} />
          </div>
          <PlainHeader center>Feature</PlainHeader>
          <PlainHeader center>Manage</PlainHeader>
        </div>
        <div className="divide-y divide-border/60">
          {rows.map((p) => {
            const st = STATUS_TONE[p.status] ?? STATUS_TONE.approved
            const wt = p.weight_class ? WEIGHT_META[p.weight_class] : null
            const isChecked = selected.has(p.id)
            return (
              <div
                key={p.id}
                className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 ${GRID} lg:gap-2.5 ${
                  isChecked ? 'bg-primary/5' : ''
                }`}
              >
                <RowCheckbox
                  checked={isChecked}
                  onChange={(v) => toggleRow(p.id, v)}
                  label={`Select ${p.title}`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/practices/${p.id}/edit`}
                      title={`Edit ${p.title}`}
                      className="truncate text-sm font-medium text-text hover:underline"
                    >
                      {p.title}
                    </Link>
                    <Link
                      href={`/practices/${p.id}`}
                      title={`View ${p.title}`}
                      aria-label={`View ${p.title}`}
                      className="shrink-0 text-subtle transition-colors hover:text-text"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                    {wt ? (
                      <span className="hidden shrink-0 lg:inline-flex">
                        <StatusChip tone={wt.tone} size="sm">{wt.label}</StatusChip>
                      </span>
                    ) : (
                      <span className="hidden shrink-0 text-2xs text-subtle lg:inline">Unset weight</span>
                    )}
                  </div>
                  <span className="mt-0.5 block text-xs text-subtle lg:hidden">
                    {wt ? `${wt.label} · ` : 'No weight · '}{p.logs_30d} in 30d · {p.creator}
                  </span>
                </div>
                <span className="hidden truncate text-xs text-muted lg:block">{p.creator}</span>
                <span
                  className="hidden flex-col items-center text-center lg:flex"
                  title={`${p.adopters} adopters · ${p.logs_total} logs all-time`}
                >
                  <span className="text-sm font-semibold tabular-nums text-text">{p.logs_30d}</span>
                  <span className="text-2xs tabular-nums text-subtle">{p.logs_total} total · {p.adopters} adopt</span>
                </span>
                <span className="hidden lg:inline-flex">
                  <StatusChip tone={st.tone} size="sm">{st.label}</StatusChip>
                </span>
                <div className="hidden justify-center lg:flex">
                  <PracticePublicToggle id={p.id} isPublic={p.is_public} />
                </div>
                <div className="flex justify-center">
                  <PracticeFeatureToggle id={p.id} featured={p.featured} />
                </div>
                <PracticeRowActions id={p.id} title={p.title} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Server pagination: keyset "Load more" on the default (score) sort; prev/next page on
          the alternate sorts (the read layer's documented split, ADR-438). */}
      <Pagination pagination={pagination} />
    </div>
  )
}

function Pagination({
  pagination,
}: {
  pagination:
    | { kind: 'cursor'; moreHref: string | null }
    | { kind: 'page'; prevHref: string | null; nextHref: string | null; page: number; pageCount: number }
}) {
  if (pagination.kind === 'cursor') {
    if (!pagination.moreHref) return null
    return (
      <div className="flex justify-center pt-1">
        <Link
          href={pagination.moreHref}
          scroll={false}
          className="inline-flex items-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
        >
          Load more
        </Link>
      </div>
    )
  }

  if (pagination.pageCount <= 1) return null
  return (
    <div className="flex items-center justify-center gap-3 pt-1">
      {pagination.prevHref ? (
        <Link
          href={pagination.prevHref}
          scroll={false}
          className="inline-flex items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
        >
          Previous
        </Link>
      ) : (
        <span className="inline-flex items-center rounded-lg border border-border/50 px-3 py-1.5 text-sm font-medium text-subtle">
          Previous
        </span>
      )}
      <span className="text-xs text-muted">Page {pagination.page} of {pagination.pageCount}</span>
      {pagination.nextHref ? (
        <Link
          href={pagination.nextHref}
          scroll={false}
          className="inline-flex items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
        >
          Next
        </Link>
      ) : (
        <span className="inline-flex items-center rounded-lg border border-border/50 px-3 py-1.5 text-sm font-medium text-subtle">
          Next
        </span>
      )}
    </div>
  )
}
