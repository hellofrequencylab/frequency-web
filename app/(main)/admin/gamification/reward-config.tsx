'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Gem, Trash2, Plus, Check, X } from 'lucide-react'
import { updateRewardConfig, createRewardConfig, deleteRewardConfig } from './reward-actions'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'

// Local copy of the union — the server action's module ('use server') exports
// only its async functions; the value is passed structurally.
type RewardKind = 'zap' | 'gem'

export interface RewardRow {
  action_type: string
  amount: number
  daily_cap: number | null
  is_active: boolean
  description: string | null
}

function prettify(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Janitor-only live editor for the reward economy: add, tune (amount / daily cap /
// on-off), and remove the reward per action. The award engines read these tables
// at grant time, so changes are live immediately — no redeploy. (DEVELOPMENT-MAP
// Stage A.)
export function RewardConfig({ zaps, gems }: { zaps: RewardRow[]; gems: RewardRow[] }) {
  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold text-text">Reward economy</h2>
        <p className="mt-0.5 text-xs text-muted">
          Tune what each action is worth, add new ones, or remove them. Changes go live immediately, no redeploy.
        </p>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <RewardTable
          kind="zap"
          label="Zaps"
          unitIcon={<Zap className="h-3.5 w-3.5 text-primary" />}
          initial={zaps}
        />
        <RewardTable
          kind="gem"
          label="Gems"
          unitIcon={<Gem className="h-3.5 w-3.5 text-signal" />}
          initial={gems}
        />
      </div>
    </section>
  )
}

const numInput = 'rounded-md border border-border bg-canvas px-2 py-1 text-xs text-text text-right'

function RewardTable({
  kind,
  label,
  unitIcon,
  initial,
}: {
  kind: RewardKind
  label: string
  unitIcon: React.ReactNode
  initial: RewardRow[]
}) {
  const [rows, setRows] = useState<RewardRow[]>(initial)
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | string>('idle')
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const router = useRouter()

  // Add-form state.
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<RewardRow>({ action_type: '', amount: kind === 'zap' ? 10 : 3, daily_cap: null, is_active: true, description: null })

  function update(i: number, patch: Partial<RewardRow>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    setStatus('idle')
  }

  function save() {
    start(async () => {
      const r = await updateRewardConfig(
        kind,
        rows.map((row) => ({
          action_type: row.action_type,
          amount: row.amount,
          daily_cap: row.daily_cap,
          is_active: row.is_active,
        })),
      )
      if (isError(r)) setStatus(r.error)
      else {
        setStatus('saved')
        router.refresh()
      }
    })
  }

  function remove(actionType: string) {
    start(async () => {
      const r = await deleteRewardConfig(kind, actionType)
      if (isError(r)) setStatus(r.error)
      else {
        setRows((prev) => prev.filter((row) => row.action_type !== actionType))
        setConfirmKey(null)
        router.refresh()
      }
    })
  }

  function add() {
    start(async () => {
      const r = await createRewardConfig(kind, draft)
      if (isError(r)) setStatus(r.error)
      else {
        setStatus('saved')
        setAdding(false)
        setDraft({ action_type: '', amount: kind === 'zap' ? 10 : 3, daily_cap: null, is_active: true, description: null })
        router.refresh()
      }
    })
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-1.5">
        {unitIcon}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text">{label}</h3>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.action_type} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-text">{prettify(row.action_type)}</p>
              {row.description && <p className="truncate text-xs text-subtle">{row.description}</p>}
            </div>
            <label className="flex items-center gap-1" title="Amount">
              <span className="text-xs text-subtle">amt</span>
              <input
                type="number"
                min={0}
                value={row.amount}
                onChange={(e) => update(i, { amount: Number(e.target.value) })}
                className={`w-16 ${numInput}`}
              />
            </label>
            <label className="flex items-center gap-1" title="Daily cap (blank = none)">
              <span className="text-xs text-subtle">cap</span>
              <input
                type="number"
                min={0}
                value={row.daily_cap ?? ''}
                placeholder="∞"
                onChange={(e) => update(i, { daily_cap: e.target.value === '' ? null : Number(e.target.value) })}
                className={`w-14 ${numInput}`}
              />
            </label>
            <label className="flex items-center gap-1" title="Active">
              <input
                type="checkbox"
                checked={row.is_active}
                onChange={(e) => update(i, { is_active: e.target.checked })}
                className="accent-primary"
              />
              <span className="text-xs text-subtle">on</span>
            </label>
            {confirmKey === row.action_type ? (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => remove(row.action_type)}
                  disabled={pending}
                  aria-label="Confirm delete"
                  className="rounded-md p-1 text-danger hover:bg-danger-bg disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmKey(null)}
                  aria-label="Cancel delete"
                  className="rounded-md p-1 text-subtle hover:bg-surface-elevated"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => { setConfirmKey(row.action_type); setStatus('idle') }}
                aria-label={`Delete ${prettify(row.action_type)}`}
                title="Delete"
                className="rounded-md p-1 text-subtle transition-colors hover:bg-danger-bg hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="py-2 text-xs text-subtle">No {label.toLowerCase()} actions configured.</p>}
      </div>

      {/* Add a new action. */}
      {adding ? (
        <div className="mt-3 space-y-2 rounded-xl border border-dashed border-border bg-canvas/50 p-3">
          <input
            autoFocus
            value={draft.action_type}
            onChange={(e) => { setDraft((d) => ({ ...d, action_type: e.target.value })); setStatus('idle') }}
            placeholder="action_name (e.g. circle_visit)"
            className="w-full rounded-md border border-border bg-canvas px-2 py-1 text-xs text-text"
          />
          <input
            value={draft.description ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="What earns it (optional)"
            className="w-full rounded-md border border-border bg-canvas px-2 py-1 text-xs text-text"
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1" title="Amount">
              <span className="text-xs text-subtle">amt</span>
              <input
                type="number"
                min={0}
                value={draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: Number(e.target.value) }))}
                className={`w-16 ${numInput}`}
              />
            </label>
            <label className="flex items-center gap-1" title="Daily cap (blank = none)">
              <span className="text-xs text-subtle">cap</span>
              <input
                type="number"
                min={0}
                value={draft.daily_cap ?? ''}
                placeholder="∞"
                onChange={(e) => setDraft((d) => ({ ...d, daily_cap: e.target.value === '' ? null : Number(e.target.value) }))}
                className={`w-14 ${numInput}`}
              />
            </label>
            <label className="flex items-center gap-1" title="Active">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
                className="accent-primary"
              />
              <span className="text-xs text-subtle">on</span>
            </label>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={add}
                disabled={pending || !draft.action_type.trim()}
                className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {pending ? 'Adding…' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setStatus('idle') }}
                className="rounded-lg px-2 py-1 text-xs text-subtle hover:text-text"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setAdding(true); setStatus('idle') }}
          className="mt-3 inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-text"
        >
          <Plus className="h-3.5 w-3.5" /> Add {label.slice(0, -1).toLowerCase()} action
        </button>
      )}

      <div className="mt-3 flex items-center gap-3">
        <Button
          size="sm"
          onClick={save}
          disabled={pending}
          className="disabled:opacity-60"
        >
          {pending ? 'Saving…' : `Save ${label.toLowerCase()}`}
        </Button>
        {status === 'saved' && <span className="text-xs text-success">Saved.</span>}
        {status !== 'idle' && status !== 'saved' && <span className="text-xs text-danger">{status}</span>}
      </div>
    </div>
  )
}
