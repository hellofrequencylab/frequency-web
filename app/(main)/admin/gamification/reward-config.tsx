'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Gem } from 'lucide-react'
import { updateRewardConfig } from './reward-actions'
import { isError } from '@/lib/action-result'

// Local copy of the union — the server action's module ('use server') exports
// only its async function; the value is passed structurally.
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

// Janitor-only live editor for the reward economy: tune the amount, daily cap,
// and on/off per action. The award engines read these tables at grant time, so
// changes are live immediately — no redeploy. (DEVELOPMENT-MAP Stage A.)
export function RewardConfig({ zaps, gems }: { zaps: RewardRow[]; gems: RewardRow[] }) {
  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden mb-8">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          Reward economy
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Tune what each action is worth. Changes go live immediately — no redeploy.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        <RewardTable
          kind="zap"
          label="Zaps"
          unitIcon={<Zap className="w-3.5 h-3.5 text-primary" />}
          initial={zaps}
        />
        <RewardTable
          kind="gem"
          label="Gems"
          unitIcon={<Gem className="w-3.5 h-3.5 text-signal" />}
          initial={gems}
        />
      </div>
    </section>
  )
}

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
  const router = useRouter()

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

  return (
    <div className="p-4">
      <div className="flex items-center gap-1.5 mb-3">
        {unitIcon}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text">{label}</h3>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.action_type} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text truncate">{prettify(row.action_type)}</p>
              {row.description && (
                <p className="text-[10px] text-subtle truncate">{row.description}</p>
              )}
            </div>
            <label className="flex items-center gap-1" title="Amount">
              <span className="text-[10px] text-subtle">amt</span>
              <input
                type="number"
                min={0}
                value={row.amount}
                onChange={(e) => update(i, { amount: Number(e.target.value) })}
                className="w-16 rounded-md border border-border bg-canvas px-2 py-1 text-xs text-text text-right"
              />
            </label>
            <label className="flex items-center gap-1" title="Daily cap (blank = none)">
              <span className="text-[10px] text-subtle">cap</span>
              <input
                type="number"
                min={0}
                value={row.daily_cap ?? ''}
                placeholder="∞"
                onChange={(e) =>
                  update(i, { daily_cap: e.target.value === '' ? null : Number(e.target.value) })
                }
                className="w-14 rounded-md border border-border bg-canvas px-2 py-1 text-xs text-text text-right"
              />
            </label>
            <label className="flex items-center gap-1" title="Active">
              <input
                type="checkbox"
                checked={row.is_active}
                onChange={(e) => update(i, { is_active: e.target.checked })}
                className="accent-primary"
              />
              <span className="text-[10px] text-subtle">on</span>
            </label>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-xs text-subtle py-2">No {label.toLowerCase()} actions configured.</p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
        >
          {pending ? 'Saving…' : `Save ${label.toLowerCase()}`}
        </button>
        {status === 'saved' && <span className="text-xs text-success">Saved.</span>}
        {status !== 'idle' && status !== 'saved' && (
          <span className="text-xs text-danger">{status}</span>
        )}
      </div>
    </div>
  )
}
