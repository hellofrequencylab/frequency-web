'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, Plus, Trash2, Zap, CheckCircle2 } from 'lucide-react'
import { createCampaign, deleteCampaign, type CampaignInput } from './campaign-actions'
import { Field } from './form-bits'

export interface CampaignCard {
  id: string
  name: string
  description: string
  target: number
  rewardZaps: number
  codeCount: number
  completions: number
  inProgress: number
}

export interface CampaignCodeOption {
  id: string
  label: string
}

export function Campaigns({
  campaigns,
  codes,
}: {
  campaigns: CampaignCard[]
  codes: CampaignCodeOption[]
}) {
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-text">
              <Trophy className="w-4 h-4 text-primary-strong" /> Campaign challenges
            </h2>
            <p className="text-xs text-muted mt-0.5">
              A scavenger hunt — members scan a set of codes to complete it and earn zaps. Shows on
              their Quest challenges automatically.
            </p>
          </div>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              disabled={codes.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
            >
              <Plus className="w-3.5 h-3.5" /> New campaign
            </button>
          )}
        </div>
        {creating &&
          (codes.length === 0 ? (
            <p className="p-4 text-xs text-muted">Create some dynamic links first — campaigns are built from them.</p>
          ) : (
            <div className="p-4">
              <CampaignForm codes={codes} onDone={() => setCreating(false)} onCancel={() => setCreating(false)} />
            </div>
          ))}
      </div>

      <div className="space-y-3">
        {campaigns.length === 0 && (
          <p className="text-sm text-muted py-6 text-center">No campaigns yet.</p>
        )}
        {campaigns.map((c) => (
          <CampaignRow key={c.id} campaign={c} />
        ))}
      </div>
    </div>
  )
}

function CampaignRow({ campaign }: { campaign: CampaignCard }) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function remove() {
    if (!confirm('Delete this campaign? Member progress toward it is removed too.')) return
    start(async () => {
      await deleteCampaign(campaign.id)
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-text truncate">{campaign.name}</h3>
          {campaign.description && <p className="text-xs text-muted mt-0.5">{campaign.description}</p>}
        </div>
        <button
          onClick={remove}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-danger transition-colors shrink-0 disabled:opacity-60"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Scan <span className="font-semibold text-text">{campaign.target}</span> of {campaign.codeCount} codes
        </span>
        <span className="inline-flex items-center gap-1">
          <Zap className="w-3 h-3 text-primary" /> {campaign.rewardZaps} zaps
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-success" /> {campaign.completions} completed
        </span>
        <span>· {campaign.inProgress} in progress</span>
      </div>
    </div>
  )
}

function CampaignForm({
  codes,
  onDone,
  onCancel,
}: {
  codes: CampaignCodeOption[]
  onDone: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<CampaignInput>({
    title: '',
    description: '',
    rewardZaps: 100,
    mode: 'collect_all',
    target: 1,
    codeIds: [],
  })
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function toggleCode(id: string) {
    setForm((f) => ({
      ...f,
      codeIds: f.codeIds.includes(id) ? f.codeIds.filter((x) => x !== id) : [...f.codeIds, id],
    }))
    setError(null)
  }

  function submit() {
    start(async () => {
      const r = await createCampaign(form)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
      onDone()
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Campaign name">
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Downtown Scavenger Hunt"
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          />
        </Field>
        <Field label="Reward (zaps)">
          <input
            type="number"
            min={0}
            value={form.rewardZaps}
            onChange={(e) => setForm((f) => ({ ...f, rewardZaps: Number(e.target.value) }))}
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          />
        </Field>
        <Field label="Goal">
          <select
            value={form.mode}
            onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as CampaignInput['mode'] }))}
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          >
            <option value="collect_all">Scan all selected codes</option>
            <option value="collect_n">Scan any N of them</option>
          </select>
        </Field>
        {form.mode === 'collect_n' && (
          <Field label="How many (N)">
            <input
              type="number"
              min={1}
              max={form.codeIds.length || undefined}
              value={form.target}
              onChange={(e) => setForm((f) => ({ ...f, target: Number(e.target.value) }))}
              className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
            />
          </Field>
        )}
      </div>

      <Field label="Description (optional)">
        <input
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="What is the hunt about?"
          className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
        />
      </Field>

      <div>
        <span className="block text-xs font-medium text-subtle mb-1">
          Codes in the hunt ({form.codeIds.length} selected)
        </span>
        <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {codes.map((c) => (
            <label key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-surface-elevated cursor-pointer">
              <input
                type="checkbox"
                checked={form.codeIds.includes(c.id)}
                onChange={() => toggleCode(c.id)}
                className="accent-primary"
              />
              <span className="text-text truncate">{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
        >
          <Trophy className="w-3.5 h-3.5" />
          {pending ? 'Creating…' : 'Create campaign'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:text-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
