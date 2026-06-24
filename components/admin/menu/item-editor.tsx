'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Lock, Trash2 } from 'lucide-react'
import type { ResolvedItem } from '@/lib/menus/types'
import { updateItem, deleteItem, type UpdateItemPatch } from '@/lib/menus/actions'
import { LinkTargetField } from './link-target-field'
import { RoleModeMatrix } from './role-mode-matrix'
import { OnOffToggle } from './on-off-toggle'
import { GateControls } from './gate-controls'

// One editable menu link. Collapsed it shows the label + an on/off toggle + drag handle;
// expanded it edits the subheading, link target, grid placement (grid surfaces only),
// the on/off visibility (the global show/hide), the two-axis access gate (min access +
// staff domain/level, ADR-390), the per-role matrix, and the ghost upsell copy
// (surfaced when any role is set to Ghost). Visibility is the UNION of the access gate
// and the per-role matrix; the gate keeps staff-only pages safe when they live inside a
// standardized container. Each save is optimistic with rollback and reports through
// onStatus.
export function ItemEditor({
  item,
  onChanged,
  onDeleted,
  onStatus,
  dragHandlers,
  isDragging,
  isGrid = true,
  pinned = false,
}: {
  item: ResolvedItem
  /** Patch the local copy after a successful save so the parent stays in sync. */
  onChanged: (patch: Partial<ResolvedItem>) => void
  onDeleted: () => void
  onStatus: (msg: string) => void
  /** Native HTML5 drag handlers wired by the parent list. */
  dragHandlers: {
    draggable: boolean
    onDragStart: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragEnd: (e: React.DragEvent) => void
  }
  isDragging: boolean
  /** True on grid surfaces (mega-menus). Linear surfaces (rail, footer) hide the grid
   *  placement controls — point 4. */
  isGrid?: boolean
  /** The fixed Profile pin (point 1b): non-draggable, non-deletable, on/off locked on. */
  pinned?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Local draft for the text fields so typing doesn't fire a save per keystroke; the
  // commit helpers save on blur / change for selects.
  const [label, setLabel] = useState(item.label)
  const [href, setHref] = useState(item.href)
  const [subheading, setSubheading] = useState(item.subheading ?? '')
  const [ghostTier, setGhostTier] = useState(item.ghostTier ?? 'crew')
  const [ghostMessage, setGhostMessage] = useState(item.ghostMessage ?? '')

  // Any per-role override set to 'ghost' means this link can present as an upsell for at
  // least one role, so surface the ghost tier + message fields to author that copy.
  const hasGhostRole = Object.values(item.roleModes).some((m) => m === 'ghost')

  function save(patch: UpdateItemPatch, optimistic: Partial<ResolvedItem>) {
    const prev: Partial<ResolvedItem> = {}
    for (const k of Object.keys(optimistic) as (keyof ResolvedItem)[]) {
      // capture the field we're about to change for rollback
      ;(prev as Record<string, unknown>)[k] = item[k]
    }
    setError(null)
    onChanged(optimistic)
    onStatus('Saving link')
    startTransition(async () => {
      // ADR-390: the access gate (min access + staff domain/level) is now editable, so we
      // persist exactly what the patch carries instead of pinning minAccess to 'visitor'.
      const res = await updateItem(item.id, patch)
      if (res.ok) onStatus('Link saved')
      else {
        onChanged(prev)
        setError(res.error)
        onStatus('Could not save link')
      }
    })
  }

  function remove() {
    if (!confirm(`Delete the link "${item.label}"? This cannot be undone.`)) return
    setError(null)
    onStatus('Deleting link')
    startTransition(async () => {
      const res = await deleteItem(item.id)
      if (res.ok) {
        onDeleted()
        onStatus('Link deleted')
      } else {
        setError(res.error)
        onStatus('Could not delete link')
      }
    })
  }

  return (
    <li className={`rounded-xl border border-border bg-canvas/40 ${isDragging ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        {pinned ? (
          <span
            className="shrink-0 text-subtle"
            aria-label="Pinned, cannot be moved"
            title="Pinned beside Feed"
          >
            <Lock className="h-4 w-4" aria-hidden />
          </span>
        ) : (
          <span
            {...dragHandlers}
            className="shrink-0 cursor-grab text-subtle active:cursor-grabbing"
            aria-label="Drag to reorder or move between groups"
            title="Drag to reorder or move between groups"
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
            {item.label || 'Untitled link'}
          </span>
          <span className="truncate text-xs text-subtle">{item.href}</span>
        </button>
        <OnOffToggle
          mode={item.mode}
          disabled={isPending}
          locked={pinned}
          label={`Show ${item.label || 'this link'}`}
          onChange={(mode) => save({ mode }, { mode })}
        />
        {!pinned && (
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            aria-label={`Delete ${item.label}`}
            className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {open && pinned && (
        <div className="space-y-2 border-t border-border px-3 py-3 text-xs text-subtle">
          <p>
            Profile is pinned beside Feed and shown to every signed-in member. Its link is
            personal to each viewer, so it cannot be renamed, retargeted, moved, or removed
            here.
          </p>
        </div>
      )}

      {open && !pinned && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-semibold text-subtle" htmlFor={`label-${item.id}`}>
                Label
              </label>
              <input
                id={`label-${item.id}`}
                type="text"
                value={label}
                disabled={isPending}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => label !== item.label && save({ label }, { label })}
                className="w-full rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
            <LinkTargetField
              value={href}
              disabled={isPending}
              onChange={setHref}
              id={`href-${item.id}`}
            />
          </div>
          {href !== item.href && !isPending && (
            <button
              type="button"
              onClick={() => save({ href }, { href })}
              className="text-xs font-semibold text-primary-strong hover:underline"
            >
              Save link target
            </button>
          )}

          {/* Requirement 4: per-item subheading (the one-line description). */}
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-semibold text-subtle" htmlFor={`sub-${item.id}`}>
              Subheading
            </label>
            <input
              id={`sub-${item.id}`}
              type="text"
              value={subheading}
              disabled={isPending}
              placeholder="A short line under the link"
              onChange={(e) => setSubheading(e.target.value)}
              onBlur={() =>
                subheading !== (item.subheading ?? '') &&
                save({ subheading: subheading || null }, { subheading: subheading || undefined })
              }
              className="w-full rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {/* Grid placement (column / row / span) — grid surfaces only (point 4). */}
          {isGrid && (
            <GridControls
              gridCol={item.gridCol}
              gridRow={item.gridRow}
              colSpan={item.colSpan}
              disabled={isPending}
              onSave={(p) =>
                save(p, {
                  gridCol: 'gridCol' in p ? (p.gridCol ?? undefined) : item.gridCol,
                  gridRow: 'gridRow' in p ? (p.gridRow ?? undefined) : item.gridRow,
                  colSpan: p.colSpan ?? item.colSpan,
                })
              }
            />
          )}

          {/* Ghost upsell copy — surfaced when ANY per-role mode is set to Ghost (point 6),
              so the operator can author the message the upsell shows. */}
          {hasGhostRole && (
            <div className="grid gap-3 rounded-lg border border-warning/30 bg-warning-bg/40 p-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-semibold text-subtle" htmlFor={`gt-${item.id}`}>
                  Ghost tier
                </label>
                <input
                  id={`gt-${item.id}`}
                  type="text"
                  value={ghostTier}
                  disabled={isPending}
                  placeholder="crew"
                  onChange={(e) => setGhostTier(e.target.value)}
                  onBlur={() =>
                    ghostTier !== (item.ghostTier ?? 'crew') &&
                    save({ ghostTier: ghostTier || null }, { ghostTier: ghostTier || undefined })
                  }
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
              <div className="min-w-0 sm:row-span-1">
                <label className="mb-1 block text-xs font-semibold text-subtle" htmlFor={`gm-${item.id}`}>
                  Ghost upsell message
                </label>
                <input
                  id={`gm-${item.id}`}
                  type="text"
                  value={ghostMessage}
                  disabled={isPending}
                  placeholder="Why this is worth unlocking"
                  onChange={(e) => setGhostMessage(e.target.value)}
                  onBlur={() =>
                    ghostMessage !== (item.ghostMessage ?? '') &&
                    save({ ghostMessage: ghostMessage || null }, { ghostMessage: ghostMessage || undefined })
                  }
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* Two-axis access gate (ADR-390): the floor + optional staff domain. */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-subtle">Who can see this</p>
            <GateControls
              minAccess={item.minAccess}
              staffDomain={item.staffDomain}
              staffLevel={item.staffLevel}
              disabled={isPending}
              onSave={(p) =>
                save(p, {
                  ...(p.minAccess != null ? { minAccess: p.minAccess } : {}),
                  ...('staffDomain' in p ? { staffDomain: p.staffDomain ?? undefined } : {}),
                  ...('staffLevel' in p ? { staffLevel: p.staffLevel ?? undefined } : {}),
                })
              }
            />
          </div>

          {/* Per-role mode matrix — the finer override layer on top of the gate. */}
          <RoleModeMatrix
            roleModes={item.roleModes}
            disabled={isPending}
            onChange={(next) => save({ roleModes: next }, { roleModes: next })}
          />
        </div>
      )}
    </li>
  )
}

// Shared column / row / span control (requirement 6). Empty col/row = auto (null).
export function GridControls({
  gridCol,
  gridRow,
  colSpan,
  disabled,
  onSave,
}: {
  gridCol?: number
  gridRow?: number
  colSpan: number
  disabled?: boolean
  onSave: (patch: { gridCol?: number | null; gridRow?: number | null; colSpan?: number }) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <NumField
        label="Column"
        value={gridCol}
        min={1}
        max={12}
        placeholder="auto"
        disabled={disabled}
        onCommit={(v) => onSave({ gridCol: v })}
      />
      <NumField
        label="Row"
        value={gridRow}
        min={1}
        max={99}
        placeholder="auto"
        disabled={disabled}
        onCommit={(v) => onSave({ gridRow: v })}
      />
      <NumField
        label="Span"
        value={colSpan}
        min={1}
        max={12}
        placeholder="1"
        disabled={disabled}
        onCommit={(v) => onSave({ colSpan: v ?? 1 })}
      />
    </div>
  )
}

function NumField({
  label,
  value,
  min,
  max,
  placeholder,
  disabled,
  onCommit,
}: {
  label: string
  value?: number
  min: number
  max: number
  placeholder?: string
  disabled?: boolean
  onCommit: (v: number | null) => void
}) {
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value))
  const initial = value == null ? '' : String(value)
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-xs font-semibold text-subtle">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === initial) return
          if (draft.trim() === '') onCommit(null)
          else {
            const n = Math.max(min, Math.min(max, Math.round(Number(draft))))
            if (Number.isFinite(n)) onCommit(n)
          }
        }}
        className="w-full rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm tabular-nums text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      />
    </div>
  )
}
