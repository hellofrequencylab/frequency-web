'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Hash, EyeOff, Eye, Pencil, Check, X } from 'lucide-react'
import { archiveChannel, unarchiveChannel, updateChannel } from '../actions'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import type { ChannelRow } from './load-channels'

// Channel list shared by the /admin/channels page and the in-place Spaces·Channels module
// (ADR-138). Each public channel now edits in place (name + description) and can be hidden;
// hidden ones tuck behind a disclosure with a restore. Speaks the shared StatusChip vocabulary.

const TYPE_TONE: Record<string, StatusTone> = {
  group: 'info',
  event: 'warning',
  thread: 'neutral',
}

const inputCls =
  'w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'

function ChannelItem({ ch }: { ch: ChannelRow }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(ch.name)
  const [description, setDescription] = useState(ch.description ?? '')
  const [pending, start] = useTransition()
  const router = useRouter()

  function save() {
    const fd = new FormData()
    fd.set('name', name)
    fd.set('description', description)
    start(async () => {
      await updateChannel(ch.id, fd)
      setEditing(false)
      router.refresh()
    })
  }

  function archive() {
    start(async () => {
      await archiveChannel(ch.id)
      router.refresh()
    })
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-2xl border border-primary-bg bg-surface-elevated/60 p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Channel name" disabled={pending} className={inputCls} />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description (optional)" disabled={pending} className={`${inputCls} resize-none`} />
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={pending || !name.trim()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50">
            <Check className="h-3.5 w-3.5" /> {pending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={pending} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-3 rounded-2xl bg-surface-elevated/60 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated">
        <Hash className="h-4 w-4 text-subtle" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text">{ch.name}</span>
          <StatusChip tone={TYPE_TONE[ch.type] ?? 'info'} size="sm">
            <span className="capitalize">{ch.type}</span>
          </StatusChip>
          <StatusChip tone="neutral" size="sm">
            <span className="capitalize">{ch.scope}</span>
          </StatusChip>
        </div>
        {ch.description && <p className="mt-0.5 truncate text-xs text-subtle">{ch.description}</p>}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setEditing(true)} title="Edit" aria-label={`Edit ${ch.name}`} className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-primary-bg hover:text-primary-strong motion-reduce:transition-none">
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" onClick={archive} disabled={pending} title="Hide from discovery" aria-label={`Hide ${ch.name}`} className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-warning-bg hover:text-warning disabled:opacity-50 motion-reduce:transition-none">
          <EyeOff className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}

function HiddenChannelItem({ ch }: { ch: ChannelRow }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-elevated/60 px-4 py-3">
      <Hash className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
      <span className="flex-1 truncate text-sm text-muted">{ch.name}</span>
      <button
        type="button"
        onClick={() =>
          start(async () => {
            await unarchiveChannel(ch.id)
            router.refresh()
          })
        }
        disabled={pending}
        title="Restore to discovery"
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
      >
        <Eye className="h-3.5 w-3.5" /> Restore
      </button>
    </div>
  )
}

export function ChannelsAdminList({ visible, hidden }: { visible: ChannelRow[]; hidden: ChannelRow[] }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {visible.length === 0 && (
          <EmptyState
            variant="first-use"
            icon={Hash}
            title="No public channels yet"
            description="Create a channel to give your people a topical or event space."
          />
        )}
        {visible.map((ch) => (
          <ChannelItem key={ch.id} ch={ch} />
        ))}
      </div>

      {hidden.length > 0 && (
        <details>
          <summary className="cursor-pointer select-none text-xs font-medium text-subtle hover:text-muted">
            {hidden.length} hidden channel{hidden.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2">
            {hidden.map((ch) => (
              <HiddenChannelItem key={ch.id} ch={ch} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
