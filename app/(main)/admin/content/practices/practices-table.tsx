'use client'

// The library table: sortable stat columns, a per-column MASTER SWITCH for Public and
// Template (flips every row at once), AND a multi-select bulk-action bar (NN/g) for a
// chosen subset — checkbox per row, "Select all", an "N selected" count, and bulk actions
// (set weight class · publish / unpublish). Sorting is client-side (the page hands down
// all rows); both bulk paths are scoped to explicit ids (the master switch to the whole
// table, the bulk bar to the checked rows) and re-gated server-side.
//
// KIT GAP (ADR-233): DataTable models selection → bulkActions and SERVER (URL) sort. This
// surface needs (a) client-side in-memory sort over the full handed-down row set, (b)
// always-on per-column master switches, and (c) a selection-driven bulk-action bar. The
// first two aren't in DataTable's contract, so the table stays bespoke here — but it speaks
// the shared StatusChip vocabulary and uses only semantic tokens. See the PR for the
// proposed contract.

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, ChevronUp, ChevronDown, X, Pencil, Trash2 } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import { DangerModal } from '@/components/admin/danger-modal'
import { deletePracticeAction } from '@/app/(main)/practices/actions'
import { setAllPracticeFlagsAction, bulkUpdatePracticesAction } from '../actions'
import {
  PracticeFeatureToggle,
  PracticePublicToggle,
  PracticeTemplateToggle,
} from '../content-controls'

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

const STATUS_TONE: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: 'info', label: 'Pending' },
  approved: { tone: 'success', label: 'Approved' },
  rejected: { tone: 'danger', label: 'Rejected' },
  draft: { tone: 'neutral', label: 'Draft' },
}

const WEIGHT_META: Record<string, { tone: StatusTone; label: string }> = {
  light: { tone: 'neutral', label: 'Light' },
  standard: { tone: 'info', label: 'Standard' },
  heavy: { tone: 'warning', label: 'Heavy' },
}

type SortKey = 'score' | 'title' | 'adopters' | 'logs_30d' | 'logs_total' | 'created_at'

const SORTS: Record<SortKey, (a: LibraryRow, b: LibraryRow) => number> = {
  score: (a, b) => b.score - a.score,
  title: (a, b) => a.title.localeCompare(b.title),
  adopters: (a, b) => b.adopters - a.adopters,
  logs_30d: (a, b) => b.logs_30d - a.logs_30d,
  logs_total: (a, b) => b.logs_total - a.logs_total,
  created_at: (a, b) => b.created_at.localeCompare(a.created_at),
}

// The 13-column desktop grid: checkbox · Practice · Creator · Adopters · 30d · Total ·
// Added · Status · Weight · Public · Template · Feature · Manage (edit + delete).
const GRID = 'lg:grid-cols-[36px_1fr_110px_76px_64px_64px_64px_84px_88px_72px_76px_56px_72px]'

function PlainHeader({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <span className={`block text-xs font-semibold uppercase tracking-wide text-muted ${center ? 'text-center' : ''}`}>
      {children}
    </span>
  )
}

function SortHeader({
  k,
  sortKey,
  flipped,
  onSort,
  center = false,
  children,
}: {
  k: SortKey
  sortKey: SortKey
  flipped: boolean
  onSort: (k: SortKey) => void
  center?: boolean
  children: React.ReactNode
}) {
  const active = sortKey === k
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={`flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide transition-colors motion-reduce:transition-none ${
        active ? 'text-text' : 'text-muted hover:text-text'
      } ${center ? 'justify-center' : ''}`}
    >
      {children}
      {active && (flipped ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />)}
    </button>
  )
}

// The bulk master switch: on when every row is on; one tap flips them all.
function MasterSwitch({
  on,
  label,
  count,
  disabled,
  onToggle,
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
      title={`Turn ${label} ${on ? 'off' : 'on'} for all ${count}`}
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
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex h-11 w-11 cursor-pointer items-center justify-center -my-3 lg:h-auto lg:w-auto lg:my-0">
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

// Per-row management: a full-page Edit (the shared PracticeBuilder at /practices/[id]/edit,
// which admins may open on any practice) and a guarded Delete (type-to-confirm; deletePractice
// is irreversible and admin-gated server-side). Desktop-only column so the dense mobile row
// keeps its three-slot layout.
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
    <div className="hidden items-center justify-center gap-1 lg:flex">
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

export function PracticesTable({ rows }: { rows: LibraryRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [flipped, setFlipped] = useState(false)
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<{ tone: StatusTone; text: string } | null>(null)
  const router = useRouter()
  // One render-stable "now" for the Added column (render must stay pure).
  const [now] = useState(() => Date.now())

  const sorted = useMemo(() => {
    const out = [...rows].sort(SORTS[sortKey])
    return flipped ? out.reverse() : out
  }, [rows, sortKey, flipped])

  const allPublic = rows.length > 0 && rows.every((r) => r.is_public)
  const allTemplate = rows.length > 0 && rows.every((r) => r.is_template)

  const allSelected = rows.length > 0 && selected.size === rows.length
  const someSelected = selected.size > 0 && !allSelected

  function setSort(key: SortKey) {
    if (key === sortKey) setFlipped((f) => !f)
    else {
      setSortKey(key)
      setFlipped(false)
    }
  }

  function bulkFlag(flag: 'is_public' | 'is_template', value: boolean) {
    start(async () => {
      await setAllPracticeFlagsAction(rows.map((r) => r.id), flag, value)
      router.refresh()
    })
  }

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set())
  }

  // The selection-driven bulk path: apply a patch to exactly the checked rows.
  function runBulk(patch: { weightClass?: 'light' | 'standard' | 'heavy'; isPublic?: boolean }, label: string) {
    const ids = [...selected]
    if (ids.length === 0) return
    setFeedback(null)
    start(async () => {
      const r = await bulkUpdatePracticesAction(ids, patch)
      if (isError(r)) {
        setFeedback({ tone: 'danger', text: r.error })
      } else {
        setFeedback({ tone: 'success', text: `${label} for ${r.data.count} ${r.data.count === 1 ? 'practice' : 'practices'}.` })
        setSelected(new Set())
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* Contextual bulk-action bar — appears only when rows are selected (NN/g). */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-surface-elevated px-3 py-2 shadow-sm"
        >
          <span className="text-sm font-semibold text-text">
            {selected.size} selected
          </span>
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />

          <span className="text-xs font-medium text-muted">Weight class</span>
          {(['light', 'standard', 'heavy'] as const).map((w) => (
            <button
              key={w}
              type="button"
              disabled={pending}
              onClick={() => runBulk({ weightClass: w }, `Set ${WEIGHT_META[w].label}`)}
              className="inline-flex min-h-[2rem] items-center rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface disabled:opacity-50 motion-reduce:transition-none"
            >
              {WEIGHT_META[w].label}
            </button>
          ))}

          <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
          <button
            type="button"
            disabled={pending}
            onClick={() => runBulk({ isPublic: true }, 'Published')}
            className="inline-flex min-h-[2rem] items-center rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/10 disabled:opacity-50 motion-reduce:transition-none"
          >
            Publish
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => runBulk({ isPublic: false }, 'Unpublished')}
            className="inline-flex min-h-[2rem] items-center rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface disabled:opacity-50 motion-reduce:transition-none"
          >
            Unpublish
          </button>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex min-h-[2rem] items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-text disabled:opacity-50 motion-reduce:transition-none"
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
        <div className={`hidden border-b border-border bg-surface-elevated/50 px-4 py-2 lg:grid ${GRID} lg:items-center lg:gap-2.5`}>
          <RowCheckbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={toggleAll}
            label="Select all practices"
          />
          <SortHeader k="title" sortKey={sortKey} flipped={flipped} onSort={setSort}>Practice</SortHeader>
          <PlainHeader>Creator</PlainHeader>
          <SortHeader k="adopters" center sortKey={sortKey} flipped={flipped} onSort={setSort}>Adopters</SortHeader>
          <SortHeader k="logs_30d" center sortKey={sortKey} flipped={flipped} onSort={setSort}>30d</SortHeader>
          <SortHeader k="logs_total" center sortKey={sortKey} flipped={flipped} onSort={setSort}>Total</SortHeader>
          <SortHeader k="created_at" center sortKey={sortKey} flipped={flipped} onSort={setSort}>Added</SortHeader>
          <PlainHeader>Status</PlainHeader>
          <PlainHeader center>Weight</PlainHeader>
          <div className="text-center">
            <PlainHeader center>Public</PlainHeader>
            <MasterSwitch on={allPublic} label="Public" count={rows.length} disabled={pending} onToggle={(v) => bulkFlag('is_public', v)} />
          </div>
          <div className="text-center">
            <PlainHeader center>Template</PlainHeader>
            <MasterSwitch on={allTemplate} label="Template" count={rows.length} disabled={pending} onToggle={(v) => bulkFlag('is_template', v)} />
          </div>
          <PlainHeader center>Feature</PlainHeader>
          <PlainHeader center>Manage</PlainHeader>
        </div>
        <div className="divide-y divide-border/60">
          {sorted.map((p) => {
            const st = STATUS_TONE[p.status] ?? STATUS_TONE.approved
            const wt = p.weight_class ? WEIGHT_META[p.weight_class] : null
            const age = Math.max(0, Math.floor((now - new Date(p.created_at).getTime()) / 86_400_000))
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
                  <Link href={`/practices/${p.id}`} className="flex items-center gap-1.5 text-sm font-medium text-text hover:underline">
                    <span className="truncate">{p.title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
                  </Link>
                  <span className="mt-0.5 block text-xs text-subtle lg:hidden">
                    {wt ? `${wt.label} · ` : 'No weight · '}{p.adopters} adopters · {p.logs_30d} logs in 30d
                  </span>
                </div>
                <span className="hidden truncate text-xs text-muted lg:block">{p.creator}</span>
                <span className="hidden text-center text-xs tabular-nums text-muted lg:block">{p.adopters}</span>
                <span className="hidden text-center text-xs tabular-nums text-muted lg:block">{p.logs_30d}</span>
                <span className="hidden text-center text-xs tabular-nums text-muted lg:block">{p.logs_total}</span>
                <span className="hidden text-center text-xs tabular-nums text-muted lg:block">
                  {age === 0 ? 'today' : `${age}d`}
                </span>
                <span className="hidden lg:inline-flex">
                  <StatusChip tone={st.tone} size="sm">{st.label}</StatusChip>
                </span>
                <span className="hidden justify-center lg:flex">
                  {wt ? (
                    <StatusChip tone={wt.tone} size="sm">{wt.label}</StatusChip>
                  ) : (
                    <span className="text-xs text-subtle">Unset</span>
                  )}
                </span>
                <div className="hidden justify-center lg:flex">
                  <PracticePublicToggle id={p.id} isPublic={p.is_public} />
                </div>
                <div className="hidden justify-center lg:flex">
                  <PracticeTemplateToggle id={p.id} isTemplate={p.is_template} />
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
    </div>
  )
}
