'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Settings2, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isError } from '@/lib/action-result'
import type { StageKind } from '@/lib/crm/pipeline'
import {
  createStage,
  renameStage,
  setStageKind,
  reorderStages,
  deleteStage,
} from '@/app/(main)/spaces/[slug]/crm/stage-actions'

// PER-SPACE PIPELINE STAGE EDITOR (ADR-517 Phase F2). The owner-only "Edit stages" mode on the CRM
// board's Pipeline view. It renders the Space's stages as an editable list: rename inline, set each
// kind (open / won / lost), reorder (drag + keyboard-accessible up/down arrows, mirroring the rail
// builder's ReorderControls), add a stage, and delete (with a confirm + the Won/Lost guard surfaced).
//
// AUTHORITY: every change persists through a server action (stage-actions.ts) that re-gates manage
// access + the crm function + the Won/Lost invariant SERVER-SIDE, so this layer is fast feedback only.
// The guards mirrored here (disable the last-Won / last-Lost removal, disable a kind-change that would
// drop the last of a kind) are UX — the server rejects the same case regardless. A staff previewer /
// non-manager never sees this control (the board only mounts it for a manager). No em dashes (voice).

type StageKindOption = { value: StageKind; label: string; dot: string }

const KIND_OPTIONS: readonly StageKindOption[] = [
  { value: 'open', label: 'Open', dot: 'bg-primary' },
  { value: 'won', label: 'Won', dot: 'bg-success' },
  { value: 'lost', label: 'Lost', dot: 'bg-danger' },
]

export interface EditableStage {
  id: string
  name: string
  kind: StageKind
  sort_order: number
}

/** How many stages carry a kind (local mirror of the server invariant, for UI disabling only). */
function countKind(stages: readonly EditableStage[], kind: StageKind): number {
  return stages.filter((s) => s.kind === kind).length
}

export function StageEditor({
  slug,
  stages: initial,
  dealCounts,
}: {
  slug: string
  stages: EditableStage[]
  /** Deals sitting in each stage id, so a delete confirm can warn the owner they will move. */
  dealCounts: Record<string, number>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [stages, setStages] = useState<EditableStage[]>(() =>
    [...initial].sort((a, b) => a.sort_order - b.sort_order),
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [dragId, setDragId] = useState<string | null>(null)

  // Add-stage form state.
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<StageKind>('open')

  const wonCount = countKind(stages, 'won')
  const lostCount = countKind(stages, 'lost')

  function run(fn: () => Promise<{ error: string } | { data: unknown }>, onOk?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (isError(res)) {
        setError(res.error)
        router.refresh() // pull the true server state back on any rejection
      } else {
        onOk?.()
        router.refresh()
      }
    })
  }

  // ── Reorder (up / down + drag). Persists the full new order as a permutation; on a server reject
  //    run() calls router.refresh() to pull the true order back. ──────────────────────────────────
  function persistOrder(next: EditableStage[]) {
    setStages(next.map((s, i) => ({ ...s, sort_order: i })))
    run(() => reorderStages(slug, next.map((s) => s.id)))
  }

  function move(index: number, dir: 'up' | 'down') {
    const to = dir === 'up' ? index - 1 : index + 1
    if (to < 0 || to >= stages.length) return
    const next = [...stages]
    ;[next[index], next[to]] = [next[to], next[index]]
    persistOrder(next)
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return setDragId(null)
    const from = stages.findIndex((s) => s.id === dragId)
    const to = stages.findIndex((s) => s.id === targetId)
    setDragId(null)
    if (from === -1 || to === -1) return
    const next = [...stages]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    persistOrder(next)
  }

  // ── Rename (commit on blur / Enter when changed + non-empty). ──────────────────────────────────
  function commitRename(stage: EditableStage, value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === stage.name) return
    setStages((cur) => cur.map((s) => (s.id === stage.id ? { ...s, name: trimmed } : s)))
    run(() => renameStage(slug, stage.id, trimmed))
  }

  // ── Kind change (guard the last-of-a-kind locally; the server re-checks). ──────────────────────
  function changeKind(stage: EditableStage, kind: StageKind) {
    if (kind === stage.kind) return
    if (stage.kind === 'won' && wonCount <= 1) {
      setError('Keep at least one Won stage. Add another Won stage first.')
      return
    }
    if (stage.kind === 'lost' && lostCount <= 1) {
      setError('Keep at least one Lost stage. Add another Lost stage first.')
      return
    }
    setStages((cur) => cur.map((s) => (s.id === stage.id ? { ...s, kind } : s)))
    run(() => setStageKind(slug, stage.id, kind))
  }

  // ── Delete (confirm; the server reassigns deals off the stage + enforces the invariant). ───────
  function removeStage(stage: EditableStage) {
    if (stage.kind === 'won' && wonCount <= 1) {
      setError('Keep at least one Won stage. Add another before removing this one.')
      return
    }
    if (stage.kind === 'lost' && lostCount <= 1) {
      setError('Keep at least one Lost stage. Add another before removing this one.')
      return
    }
    const inStage = dealCounts[stage.id] ?? 0
    const message =
      inStage > 0
        ? `Remove "${stage.name}"? Its ${inStage} deal${inStage === 1 ? '' : 's'} will move to your next open stage.`
        : `Remove "${stage.name}"?`
    if (!window.confirm(message)) return
    setStages((cur) => cur.filter((s) => s.id !== stage.id))
    run(() => deleteStage(slug, stage.id))
  }

  // ── Add a stage. ───────────────────────────────────────────────────────────────────────────────
  function addStage() {
    const name = newName.trim()
    if (!name) {
      setError('Name the stage first.')
      return
    }
    run(
      () => createStage(slug, name, newKind),
      () => {
        setNewName('')
        setNewKind('open')
      },
    )
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Settings2 className="h-3.5 w-3.5" aria-hidden /> Edit stages
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-text">Edit stages</p>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-subtle" aria-hidden />}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          <Check className="h-3.5 w-3.5" aria-hidden /> Done
        </Button>
      </div>

      <p className="mb-3 text-xs text-muted">
        Rename a stage, set whether it counts as Open, Won, or Lost, and drag to reorder. Keep at least
        one Won and one Lost stage. Removing a stage moves its deals to your next open stage.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {stages.map((stage, index) => {
          const lockWon = stage.kind === 'won' && wonCount <= 1
          const lockLost = stage.kind === 'lost' && lostCount <= 1
          const locked = lockWon || lockLost
          return (
            <li
              key={stage.id}
              draggable
              onDragStart={() => setDragId(stage.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(stage.id)}
              onDragEnd={() => setDragId(null)}
              className={cn(
                'flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas p-2 sm:flex-nowrap',
                dragId === stage.id && 'opacity-60',
              )}
            >
              <span className="cursor-grab text-subtle" aria-hidden>
                <GripVertical className="h-4 w-4" />
              </span>

              <div className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(index, 'up')}
                  disabled={pending || index === 0}
                  aria-label={`Move ${stage.name} up`}
                  className="rounded-md p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 'down')}
                  disabled={pending || index === stages.length - 1}
                  aria-label={`Move ${stage.name} down`}
                  className="rounded-md p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <input
                type="text"
                defaultValue={stage.name}
                aria-label={`Stage name for ${stage.name}`}
                disabled={pending}
                onBlur={(e) => commitRename(stage, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
              />

              <label className="sr-only" htmlFor={`kind-${stage.id}`}>
                Stage type for {stage.name}
              </label>
              <select
                id={`kind-${stage.id}`}
                value={stage.kind}
                disabled={pending}
                onChange={(e) => changeKind(stage, e.target.value as StageKind)}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-primary"
              >
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => removeStage(stage)}
                disabled={pending || locked}
                aria-label={`Remove ${stage.name}`}
                title={locked ? 'Keep at least one Won and one Lost stage.' : undefined}
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>

      {/* Add a stage */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-2 sm:flex-nowrap">
        <input
          type="text"
          value={newName}
          placeholder="New stage name"
          aria-label="New stage name"
          disabled={pending}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addStage()
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
        />
        <label className="sr-only" htmlFor="new-stage-kind">
          New stage type
        </label>
        <select
          id="new-stage-kind"
          value={newKind}
          disabled={pending}
          onChange={(e) => setNewKind(e.target.value as StageKind)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-primary"
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={addStage}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-subtle">
        <X className="h-3 w-3" aria-hidden />
        Changes save as you make them.
      </div>
    </div>
  )
}
