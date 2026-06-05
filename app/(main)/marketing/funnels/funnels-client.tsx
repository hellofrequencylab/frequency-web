'use client'

// Campaign list + create for the admin funnels builder (ADR-126, Phase 2).

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Archive, ChevronRight } from 'lucide-react'
import { listEntryTemplates } from '@/lib/entry-points/templates'
import type { Campaign } from '@/lib/entry-points/campaigns'
import { createCampaign, archiveCampaign } from './actions'

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-success/10 text-success',
  draft: 'bg-border-strong/20 text-muted',
  archived: 'bg-border-strong/20 text-subtle',
}

export function FunnelsManager({ campaigns }: { campaigns: Campaign[] }) {
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold text-text">New campaign</h2>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-3.5 w-3.5" /> New campaign
            </button>
          )}
        </div>
        {creating && (
          <div className="p-4">
            <CampaignForm onDone={() => setCreating(false)} onCancel={() => setCreating(false)} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        {campaigns.length === 0 && !creating && (
          <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            No campaigns yet. Create one, then add entry points to it.
          </p>
        )}
        {campaigns.map((c) => (
          <CampaignRow key={c.id} campaign={c} />
        ))}
      </section>
    </div>
  )
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function archive() {
    if (!confirm('Archive this campaign? Its entry points keep working.')) return
    start(async () => {
      await archiveCampaign(campaign.id)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <Link href={`/marketing/funnels/${campaign.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-bold text-text">{campaign.name}</h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[campaign.status] ?? STATUS_STYLE.draft}`}>
            {campaign.status}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          <span className="font-semibold text-text">{campaign.entryCount}</span> entry point{campaign.entryCount === 1 ? '' : 's'} ·{' '}
          <span className="font-semibold text-text">{campaign.scans}</span> scan{campaign.scans === 1 ? '' : 's'}
        </p>
      </Link>
      {campaign.status !== 'archived' && (
        <button
          onClick={archive}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-danger disabled:opacity-60"
        >
          <Archive className="h-3 w-3" /> Archive
        </button>
      )}
      <Link
        href={`/marketing/funnels/${campaign.id}`}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted transition-colors hover:text-text"
      >
        Open <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  )
}

function CampaignForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit() {
    start(async () => {
      const r = await createCampaign({ name, goal: goal || undefined })
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.push(`/marketing/funnels/${r.data.id}`)
      onDone()
    })
  }

  const field = 'w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text'
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-subtle">Campaign name</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setError(null) }} placeholder="e.g. Spring street team" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-subtle">Default goal (optional)</span>
          <select value={goal} onChange={(e) => setGoal(e.target.value)} className={field}>
            <option value="">— none —</option>
            {listEntryTemplates().map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create campaign'}
        </button>
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">
          Cancel
        </button>
      </div>
    </div>
  )
}
