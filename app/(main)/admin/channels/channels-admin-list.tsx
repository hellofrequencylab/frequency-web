'use client'

import { Hash, EyeOff } from 'lucide-react'
import { archiveChannel } from '../actions'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import type { ChannelRow } from './load-channels'

// Presentational channel list shared by the /admin/channels page and the in-place
// Spaces·Channels module (ADR-138). Public channels with an archive (hide) action;
// hidden ones tucked behind a disclosure. Speaks the shared StatusChip vocabulary
// (retired the local TYPE_COLOR dict) and the EmptyState taxonomy.

const TYPE_TONE: Record<string, StatusTone> = {
  group: 'info',
  event: 'warning',
  thread: 'neutral',
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
          <div key={ch.id} className="group flex items-center gap-3 rounded-2xl bg-surface-elevated/60 px-4 py-3">
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
            <form action={archiveChannel.bind(null, ch.id)}>
              <button
                type="submit"
                title="Hide from discovery"
                className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-warning-bg hover:text-warning motion-reduce:transition-none"
              >
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
              </button>
            </form>
          </div>
        ))}
      </div>

      {hidden.length > 0 && (
        <details>
          <summary className="cursor-pointer select-none text-xs font-medium text-subtle hover:text-muted">
            {hidden.length} hidden channel{hidden.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2 opacity-60">
            {hidden.map((ch) => (
              <div key={ch.id} className="flex items-center gap-3 rounded-2xl bg-surface-elevated/60 px-4 py-3">
                <Hash className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="flex-1 text-sm text-muted">{ch.name}</span>
                <span className="text-xs text-subtle">hidden</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
