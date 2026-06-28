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
import { ExternalLink, ChevronUp, ChevronDown, X, Pencil, Trash2, Search } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import { DangerModal } from '@/components/admin/danger-modal'
import { deletePracticeAction } from '@/app/(main)/practices/actions'
import { setAllPracticeFlagsAction, bulkUpdatePracticesAction } from '../actions'
import { PracticeFeatureToggle, PracticePublicToggle } from '../content-controls'

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

type SortKey =
  | 'score'
  | 'title'
  | 'creator'
  | 'adopters'
  | 'logs_30d'
  | 'logs_total'
  | 'created_at'
  | 'status'
  | 'weight'

const STATUS_ORDER: Record<string, number> = { approved: 0, pending: 1, draft: 2, rejected: 3 }
const WEIGHT_ORDER: Record<string, number> = { light: 0, standard: 1, heavy: 2 }

// Chain comparators: first non-zero wins. Keeps every sort stable and predictable —
// a stat column tie-breaks by score then title, so equal-value rows never shuffle.
function chain(...cmps: ((a: LibraryRow, b: LibraryRow) => number)[]) {
  return (a: LibraryRow, b: LibraryRow) => {
    for (const c of cmps) {
      const r = c(a, b)
      if (r) return r
    }
    return 0
  }
}
const byTitle = (a: LibraryRow, b: LibraryRow) => a.title.localeCompare(b.title)
const byScore = (a: LibraryRow, b: LibraryRow) => b.score - a.score

const SORTS: Record<SortKey, (a: LibraryRow, b: LibraryRow) => number> = {
  score: chain(byScore, byTitle),
  title: byTitle,
  creator: chain((a, b) => a.creator.localeCompare(b.creator), byScore, byTitle),
  adopters: chain((a, b) => b.adopters - a.adopters, byScore, byTitle),
  logs_30d: chain((a, b) => b.logs_30d - a.logs_30d, byScore, byTitle),
  logs_total: chain((a, b) => b.logs_total - a.logs_total, byScore, byTitle),
  created_at: chain((a, b) => b.created_at.localeCompare(a.created_at), byTitle),
  status: chain((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9), byScore, byTitle),
  weight: chain(
    (a, b) => (WEIGHT_ORDER[a.weight_class ?? ''] ?? 9) - (WEIGHT_ORDER[b.weight_class ?? ''] ?? 9),
    byScore,
    byTitle,
  ),
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  pending: 'Pending',
  draft: 'Draft',
  rejected: 'Rejected',
}

// The lean management grid (8 cols): checkbox · Practice (+ weight chip) · Creator ·
// Usage · Status · Public · Feature · Manage. The raw stat spread (adopters / total /
// added) folds into one Usage cell; low-frequency knobs (weight, template) move to the
// bulk bar and the edit surface — the main view is for triage and the high-frequency
// levers (find it, see its status, set visibility, feature it).
const GRID = 'lg:grid-cols-[36px_1fr_128px_112px_104px_72px_56px_72px]'

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

// A filter toggle chip: on shows a filled primary state, off is a quiet outline.
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-[2rem] items-center rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors motion-reduce:transition-none ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted hover:border-border-strong hover:text-text'
      }`}
    >
      {children}
    </button>
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

  // Client-side filters over the handed-down set (a Phase 1 server facet layer
  // replaces this once the library passes the ~200-row ceiling — see ADR-438).
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [onlyPublic, setOnlyPublic] = useState(false)
  const [onlyTemplate, setOnlyTemplate] = useState(false)
  const [onlyFeatured, setOnlyFeatured] = useState(false)
  const [onlyUnset, setOnlyUnset] = useState(false)

  const statuses = useMemo(
    () => [...new Set(rows.map((r) => r.status).filter(Boolean))],
    [rows],
  )
  const hasFilters =
    query.trim() !== '' || statusFilter !== '' || onlyPublic || onlyTemplate || onlyFeatured || onlyUnset

  // Filter first, then sort. Every downstream action (master switch, select-all,
  // bulk bar) operates on this visible set — what you see is what you act on.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !`${r.title} ${r.creator}`.toLowerCase().includes(q)) return false
      if (statusFilter && r.status !== statusFilter) return false
      if (onlyPublic && !r.is_public) return false
      if (onlyTemplate && !r.is_template) return false
      if (onlyFeatured && !r.featured) return false
      if (onlyUnset && r.weight_class) return false
      return true
    })
  }, [rows, query, statusFilter, onlyPublic, onlyTemplate, onlyFeatured, onlyUnset])

  const sorted = useMemo(() => {
    const out = [...filtered].sort(SORTS[sortKey])
    return flipped ? out.reverse() : out
  }, [filtered, sortKey, flipped])

  const allPublic = filtered.length > 0 && filtered.every((r) => r.is_public)

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id))
  const someSelected = selected.size > 0 && !allSelected

  function clearFilters() {
    setQuery('')
    setStatusFilter('')
    setOnlyPublic(false)
    setOnlyTemplate(false)
    setOnlyFeatured(false)
    setOnlyUnset(false)
  }

  function setSort(key: SortKey) {
    if (key === sortKey) setFlipped((f) => !f)
    else {
      setSortKey(key)
      setFlipped(false)
    }
  }

  function bulkFlag(flag: 'is_public' | 'is_template', value: boolean) {
    start(async () => {
      await setAllPracticeFlagsAction(filtered.map((r) => r.id), flag, value)
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
    setSelected(checked ? new Set(filtered.map((r) => r.id)) : new Set())
  }

  // Template is a low-frequency curation flag, so it lives in the bulk bar (scoped to the
  // checked rows) rather than a per-row column on the main view.
  function bulkTemplate(value: boolean) {
    const ids = [...selected]
    if (ids.length === 0) return
    setFeedback(null)
    start(async () => {
      await setAllPracticeFlagsAction(ids, 'is_template', value)
      setFeedback({
        tone: 'success',
        text: `${value ? 'Marked' : 'Unmarked'} template for ${ids.length} ${ids.length === 1 ? 'practice' : 'practices'}.`,
      })
      setSelected(new Set())
      router.refresh()
    })
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

      {/* Search · filter · sort toolbar. Client-side over the handed-down set; a Phase 1
          server facet layer takes over past the ~200-row ceiling (ADR-438). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or creator"
            aria-label="Search practices"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <FilterChip active={onlyPublic} onClick={() => setOnlyPublic((v) => !v)}>Public</FilterChip>
        <FilterChip active={onlyTemplate} onClick={() => setOnlyTemplate((v) => !v)}>Template</FilterChip>
        <FilterChip active={onlyFeatured} onClick={() => setOnlyFeatured((v) => !v)}>Featured</FilterChip>
        <FilterChip active={onlyUnset} onClick={() => setOnlyUnset((v) => !v)}>Unset weight</FilterChip>

        <div className="ml-auto flex items-center gap-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="practice-sort">Sort</label>
          <select
            id="practice-sort"
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey)
              setFlipped(false)
            }}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="score">Best (usage score)</option>
            <option value="logs_30d">Logs (30d)</option>
            <option value="logs_total">Logs (total)</option>
            <option value="adopters">Adopters</option>
            <option value="created_at">Recently added</option>
            <option value="title">Title (A-Z)</option>
            <option value="creator">Creator</option>
            <option value="status">Status</option>
            <option value="weight">Weight</option>
          </select>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? 'Sort ascending' : 'Sort descending'}
            title={flipped ? 'Ascending' : 'Descending'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-strong hover:text-text"
          >
            {flipped ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted">
          Showing {sorted.length} of {rows.length}
        </span>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-text"
          >
            <X className="h-3 w-3" aria-hidden /> Clear filters
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className={`hidden border-b border-border bg-surface-elevated/50 px-4 py-2 lg:grid ${GRID} lg:items-center lg:gap-2.5`}>
          <RowCheckbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={toggleAll}
            label="Select all practices"
          />
          <SortHeader k="title" sortKey={sortKey} flipped={flipped} onSort={setSort}>Practice</SortHeader>
          <SortHeader k="creator" sortKey={sortKey} flipped={flipped} onSort={setSort}>Creator</SortHeader>
          <SortHeader k="logs_30d" center sortKey={sortKey} flipped={flipped} onSort={setSort}>Usage</SortHeader>
          <SortHeader k="status" sortKey={sortKey} flipped={flipped} onSort={setSort}>Status</SortHeader>
          <div className="text-center">
            <PlainHeader center>Public</PlainHeader>
            <MasterSwitch on={allPublic} label="Public" count={filtered.length} disabled={pending} onToggle={(v) => bulkFlag('is_public', v)} />
          </div>
          <PlainHeader center>Feature</PlainHeader>
          <PlainHeader center>Manage</PlainHeader>
        </div>
        <div className="divide-y divide-border/60">
          {sorted.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">
              No practices match these filters.
            </p>
          ) : (
            sorted.map((p) => {
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
                    <div className="flex items-center gap-1.5">
                      {/* The title opens the full editor (the manage context). */}
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
                      {/* Weight is a quiet read-only chip here (it becomes auto-computed
                          per ADR-438). Set it in bulk or on the practice's edit page. */}
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
                  {/* Usage: recent (30d) is the signal that matters; total + adopters ride
                      along muted, with the added-age on hover. One cell, the whole story. */}
                  <span
                    className="hidden flex-col items-center text-center lg:flex"
                    title={`${p.adopters} adopters · ${p.logs_total} logs all-time · added ${age === 0 ? 'today' : `${age}d ago`}`}
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
            })
          )}
        </div>
      </div>
    </div>
  )
}
