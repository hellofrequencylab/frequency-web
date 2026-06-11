'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, Plus, Trash2, Zap, CheckCircle2, Pencil } from 'lucide-react'
import { createCampaign, updateCampaign, deleteCampaign, type CampaignInput } from './campaign-actions'
import { Field, Badge, toLocalInput, fromLocalInput } from './form-bits'
import { Button } from '@/components/ui/button'

export interface CampaignCard {
  id: string
  name: string
  description: string
  target: number
  rewardZaps: number
  codeCount: number
  completions: number
  inProgress: number
  validFrom: string | null
  validUntil: string | null
  /** The qr_code ids in the hunt (for editing). */
  codeIds: string[]
}

function windowStatus(
  validFrom: string | null,
  validUntil: string | null,
): { label: string; tone: 'neutral' | 'signal' | 'warning' } {
  const now = Date.now()
  if (validFrom && new Date(validFrom).getTime() > now) return { label: 'Scheduled', tone: 'signal' }
  if (validUntil && new Date(validUntil).getTime() < now) return { label: 'Ended', tone: 'warning' }
  return { label: 'Active', tone: 'neutral' }
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
              A scavenger hunt. Members scan a set of codes to complete it and earn Zaps. Shows on
              their Quest challenges automatically.
            </p>
          </div>
          {!creating && (
            <Button
              size="sm"
              onClick={() => setCreating(true)}
              disabled={codes.length === 0}
              className="disabled:opacity-60"
            >
              <Plus className="w-3.5 h-3.5" /> New campaign
            </Button>
          )}
        </div>
        {creating &&
          (codes.length === 0 ? (
            <p className="p-4 text-xs text-muted">Create some dynamic links first. Campaigns are built from them.</p>
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
          <CampaignRow key={c.id} campaign={c} codes={codes} />
        ))}
      </div>
    </div>
  )
}

function CampaignRow({ campaign, codes }: { campaign: CampaignCard; codes: CampaignCodeOption[] }) {
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const router = useRouter()

  function remove() {
    if (!confirm('Delete this campaign? Member progress toward it is removed too.')) return
    start(async () => {
      await deleteCampaign(campaign.id)
      router.refresh()
    })
  }

  const status = windowStatus(campaign.validFrom, campaign.validUntil)

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-text truncate">{campaign.name}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          {campaign.description && <p className="text-xs text-muted mt-0.5">{campaign.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
          >
            <Pencil className="w-3 h-3" /> {editing ? 'Close' : 'Edit'}
          </button>
          <button
            onClick={remove}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-danger transition-colors disabled:opacity-60"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Scan <span className="font-semibold text-text">{campaign.target}</span> of {campaign.codeCount} codes
        </span>
        <span className="inline-flex items-center gap-1">
          <Zap className="w-3 h-3 text-primary" /> {campaign.rewardZaps} Zaps
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-success" /> {campaign.completions} completed
        </span>
        <span>· {campaign.inProgress} in progress</span>
        {status.label === 'Scheduled' && campaign.validFrom && (
          <span>· starts {new Date(campaign.validFrom).toLocaleDateString()}</span>
        )}
        {campaign.validUntil && (
          <span>· ends {new Date(campaign.validUntil).toLocaleDateString()}</span>
        )}
      </div>

      {editing && (
        <div className="mt-3 border-t border-border pt-3">
          <CampaignForm
            codes={codes}
            campaign={campaign}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  )
}

function CampaignForm({
  codes,
  campaign,
  onDone,
  onCancel,
}: {
  codes: CampaignCodeOption[]
  campaign?: CampaignCard
  onDone: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<CampaignInput>(
    campaign
      ? {
          title: campaign.name,
          description: campaign.description,
          rewardZaps: campaign.rewardZaps,
          mode: campaign.target >= campaign.codeIds.length ? 'collect_all' : 'collect_n',
          target: campaign.target,
          codeIds: campaign.codeIds,
          validFrom: campaign.validFrom,
          validUntil: campaign.validUntil,
        }
      : {
          title: '',
          description: '',
          rewardZaps: 100,
          mode: 'collect_all',
          target: 1,
          codeIds: [],
          validFrom: null,
          validUntil: null,
        },
  )
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
      const r = campaign ? await updateCampaign(campaign.id, form) : await createCampaign(form)
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
        <Field label="Starts (optional)">
          <input
            type="datetime-local"
            value={toLocalInput(form.validFrom)}
            onChange={(e) => setForm((f) => ({ ...f, validFrom: fromLocalInput(e.target.value) }))}
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          />
        </Field>
        <Field label="Ends (optional)">
          <input
            type="datetime-local"
            value={toLocalInput(form.validUntil)}
            onChange={(e) => setForm((f) => ({ ...f, validUntil: fromLocalInput(e.target.value) }))}
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          />
        </Field>
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
        <Button size="sm" onClick={submit} disabled={pending} className="disabled:opacity-60">
          <Trophy className="w-3.5 h-3.5" />
          {pending
            ? campaign
              ? 'Saving…'
              : 'Creating…'
            : campaign
              ? 'Save campaign'
              : 'Create campaign'}
        </Button>
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
