'use client'

// Entry-point A/B manager (ADR-136): define destination variants + read results.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Trophy } from 'lucide-react'
import type { DestinationGroup } from '@/lib/entry-points/destinations'
import type { VariantResult } from '@/lib/entry-points/ab'
import { addVariant, updateVariant, deleteVariant } from '../actions'

const field = 'w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text'
const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`

function DestinationSelect({ value, onChange, groups }: { value: string; onChange: (v: string) => void; groups: DestinationGroup[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={field}>
      <option value="">— pick a destination —</option>
      {groups.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.items.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export function VariantManager({
  codeId,
  control,
  results,
  destinationGroups,
}: {
  codeId: string
  control: string
  results: VariantResult[]
  destinationGroups: DestinationGroup[]
}) {
  // Call a winner only once ≥2 variants have scans: the highest conversion rate.
  const scored = results.filter((r) => r.scans > 0)
  const winnerKey =
    scored.length >= 2 ? [...scored].sort((a, b) => b.rate - a.rate || b.conversions - a.conversions)[0].key : null

  return (
    <div className="space-y-6">
      <p className="rounded-xl bg-surface-elevated/50 px-4 py-2.5 text-xs text-muted">
        <span className="font-semibold text-text">Control (default):</span> {control || '—'} · shown when no active variant wins the split.
      </p>

      <section className="space-y-3">
        {results.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            No variants yet. Add two or more destinations below to start splitting scans.
          </p>
        ) : (
          <div className="rounded-2xl bg-surface-elevated/40 px-2 py-1.5">
            <div className="grid grid-cols-[3rem_1fr_3.5rem_3.5rem_4rem_4.5rem_2rem] gap-2 px-3 py-2 text-xs font-medium text-subtle">
              <span>Key</span><span>Destination</span><span className="text-right">Wt</span>
              <span className="text-right">Scans</span><span className="text-right">Signups</span><span className="text-right">Rate</span><span></span>
            </div>
            {results.map((r) => (
              <VariantRow key={r.id} codeId={codeId} v={r} groups={destinationGroups} isWinner={r.key === winnerKey} />
            ))}
          </div>
        )}
      </section>

      <AddVariant codeId={codeId} groups={destinationGroups} />
    </div>
  )
}

function VariantRow({ codeId, v, groups, isWinner }: { codeId: string; v: VariantResult; groups: DestinationGroup[]; isWinner: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(v.label)
  const [target, setTarget] = useState(v.targetUrl)
  const [weight, setWeight] = useState(String(v.weight))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      const res = await updateVariant(codeId, v.id, { label, targetUrl: target, weight: Number(weight), active: v.active })
      if ('error' in res) { setError(res.error); return }
      setEditing(false); router.refresh()
    })
  const toggle = () =>
    start(async () => { await updateVariant(codeId, v.id, { label: v.label, targetUrl: v.targetUrl, weight: v.weight, active: !v.active }); router.refresh() })
  const remove = () => { if (confirm('Delete this variant?')) start(async () => { await deleteVariant(codeId, v.id); router.refresh() }) }

  if (editing) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-canvas/40 p-3">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className={field} />
        <DestinationSelect value={target} onChange={setTarget} groups={groups} />
        <div className="flex items-center gap-2">
          <label className="text-xs text-subtle">Weight</label>
          <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="numeric" className="w-20 rounded-md border border-border bg-canvas px-2 py-1 text-sm" />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={pending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">Save</button>
          <button onClick={() => { setEditing(false); setError(null) }} className="px-2 py-1.5 text-xs font-semibold text-muted hover:text-text">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-[3rem_1fr_3.5rem_3.5rem_4rem_4.5rem_2rem] gap-2 px-3 py-2.5 items-center rounded-lg ${v.active ? '' : 'opacity-50'}`}>
      <span className="flex items-center gap-1 text-sm font-bold text-text">
        {v.key}{isWinner && <Trophy className="h-3 w-3 text-primary" aria-label="Leading" />}
      </span>
      <button onClick={() => setEditing(true)} className="min-w-0 text-left">
        <span className="block truncate text-sm text-text">{v.label}</span>
        <span className="block truncate text-[11px] text-subtle">{v.targetUrl}</span>
      </button>
      <span className="text-right text-sm tabular-nums text-muted">{v.weight}</span>
      <span className="text-right text-sm tabular-nums text-text">{v.scans}</span>
      <span className="text-right text-sm tabular-nums font-semibold text-text">{v.conversions}</span>
      <span className={`text-right text-sm tabular-nums ${isWinner ? 'font-bold text-primary-strong' : 'text-muted'}`}>{pct(v.rate)}</span>
      <div className="flex items-center justify-end gap-1">
        <button onClick={toggle} disabled={pending} title={v.active ? 'Pause' : 'Resume'} className="text-[10px] font-semibold text-subtle hover:text-text disabled:opacity-60">{v.active ? '❚❚' : '▶'}</button>
        <button onClick={remove} disabled={pending} aria-label="Delete variant" className="text-muted hover:text-danger disabled:opacity-60"><Trash2 className="h-3 w-3" /></button>
      </div>
    </div>
  )
}

function AddVariant({ codeId, groups }: { codeId: string; groups: DestinationGroup[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [target, setTarget] = useState('')
  const [weight, setWeight] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      const res = await addVariant(codeId, { key, label, targetUrl: target, weight: Number(weight) })
      if ('error' in res) { setError(res.error); return }
      setOpen(false); setKey(''); setLabel(''); setTarget(''); setWeight('1'); setError(null)
      router.refresh()
    })

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-text hover:border-border-strong">
        <Plus className="h-3.5 w-3.5" /> Add variant
      </button>
    )
  }
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-[6rem_1fr]">
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Key (a)" className={field} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Event flow)" className={field} />
      </div>
      <DestinationSelect value={target} onChange={setTarget} groups={groups} />
      <div className="flex items-center gap-2">
        <label className="text-xs text-subtle">Weight</label>
        <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="numeric" className="w-20 rounded-md border border-border bg-canvas px-2 py-1 text-sm" />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={pending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">Add variant</button>
        <button onClick={() => { setOpen(false); setError(null) }} className="px-2 py-1.5 text-xs font-semibold text-muted hover:text-text">Cancel</button>
      </div>
    </div>
  )
}
