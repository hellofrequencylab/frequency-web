'use client'

// The library table: sortable stat columns + bulk on/off master switches for
// Public and Template. Sorting is client-side (the page hands down all rows);
// the master switch flips exactly the rows on this table, never the review
// queue, via setAllPracticeFlagsAction.

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, ChevronUp, ChevronDown } from 'lucide-react'
import { setAllPracticeFlagsAction } from '../actions'
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
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-signal/10 text-signal' },
  approved: { label: 'Approved', cls: 'bg-success/10 text-success' },
  rejected: { label: 'Rejected', cls: 'bg-danger-bg text-danger' },
  draft: { label: 'Draft', cls: 'bg-border/60 text-muted' },
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

function PlainHeader({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <span className={`block text-xs font-semibold uppercase tracking-wider text-subtle ${center ? 'text-center' : ''}`}>
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
      className={`flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
        active ? 'text-text' : 'text-subtle hover:text-text'
      } ${center ? 'justify-center' : ''}`}
    >
      {children}
      {active && (flipped ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
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
      className={`relative mx-auto mt-1 block h-3.5 w-7 rounded-full transition-colors disabled:opacity-50 ${
        on ? 'bg-primary' : 'bg-border'
      }`}
    >
      <span
        className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-surface shadow transition-all ${
          on ? 'left-4' : 'left-0.5'
        }`}
      />
    </button>
  )
}

export function PracticesTable({ rows }: { rows: LibraryRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [flipped, setFlipped] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  // One render-stable "now" for the Added column (render must stay pure).
  const [now] = useState(() => Date.now())

  const sorted = useMemo(() => {
    const out = [...rows].sort(SORTS[sortKey])
    return flipped ? out.reverse() : out
  }, [rows, sortKey, flipped])

  const allPublic = rows.length > 0 && rows.every((r) => r.is_public)
  const allTemplate = rows.length > 0 && rows.every((r) => r.is_template)

  function setSort(key: SortKey) {
    if (key === sortKey) setFlipped((f) => !f)
    else {
      setSortKey(key)
      setFlipped(false)
    }
  }

  function bulk(flag: 'is_public' | 'is_template', value: boolean) {
    start(async () => {
      await setAllPracticeFlagsAction(rows.map((r) => r.id), flag, value)
      router.refresh()
    })
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="hidden border-b border-border px-4 py-2 lg:grid lg:grid-cols-[1fr_110px_76px_64px_64px_64px_84px_72px_76px_56px] lg:items-center lg:gap-2.5">
        <SortHeader k="title" sortKey={sortKey} flipped={flipped} onSort={setSort}>Practice</SortHeader>
        <PlainHeader>Creator</PlainHeader>
        <SortHeader k="adopters" center sortKey={sortKey} flipped={flipped} onSort={setSort}>Adopters</SortHeader>
        <SortHeader k="logs_30d" center sortKey={sortKey} flipped={flipped} onSort={setSort}>30d</SortHeader>
        <SortHeader k="logs_total" center sortKey={sortKey} flipped={flipped} onSort={setSort}>Total</SortHeader>
        <SortHeader k="created_at" center sortKey={sortKey} flipped={flipped} onSort={setSort}>Added</SortHeader>
        <PlainHeader>Status</PlainHeader>
        <div className="text-center">
          <PlainHeader center>Public</PlainHeader>
          <MasterSwitch on={allPublic} label="Public" count={rows.length} disabled={pending} onToggle={(v) => bulk('is_public', v)} />
        </div>
        <div className="text-center">
          <PlainHeader center>Template</PlainHeader>
          <MasterSwitch on={allTemplate} label="Template" count={rows.length} disabled={pending} onToggle={(v) => bulk('is_template', v)} />
        </div>
        <PlainHeader center>Feature</PlainHeader>
      </div>
      <div className="divide-y divide-border/50">
        {sorted.map((p) => {
          const st = STATUS_STYLES[p.status] ?? STATUS_STYLES.approved
          const age = Math.max(0, Math.floor((now - new Date(p.created_at).getTime()) / 86_400_000))
          return (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 lg:grid-cols-[1fr_110px_76px_64px_64px_64px_84px_72px_76px_56px] lg:gap-2.5"
            >
              <div className="min-w-0">
                <Link href={`/practices/${p.id}`} className="flex items-center gap-1.5 text-sm font-medium text-text hover:underline">
                  <span className="truncate">{p.title}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-subtle" />
                </Link>
                <span className="mt-0.5 block text-xs text-subtle lg:hidden">
                  {p.adopters} adopters · {p.logs_30d} logs in 30d
                </span>
              </div>
              <span className="hidden truncate text-xs text-muted lg:block">{p.creator}</span>
              <span className="hidden text-center text-xs tabular-nums text-muted lg:block">{p.adopters}</span>
              <span className="hidden text-center text-xs tabular-nums text-muted lg:block">{p.logs_30d}</span>
              <span className="hidden text-center text-xs tabular-nums text-muted lg:block">{p.logs_total}</span>
              <span className="hidden text-center text-xs tabular-nums text-muted lg:block">
                {age === 0 ? 'today' : `${age}d`}
              </span>
              <span className={`hidden w-fit items-center rounded-md px-2 py-0.5 text-xs font-semibold lg:inline-flex ${st.cls}`}>
                {st.label}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
