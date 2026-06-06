'use client'

import { Hash, EyeOff } from 'lucide-react'
import { archiveChannel } from '../actions'
import type { ChannelRow } from './load-channels'

// Presentational channel list shared by the /admin/channels page and the in-place
// Spaces·Channels module (ADR-138). Public channels with an archive (hide) action;
// hidden ones tucked behind a disclosure.

const TYPE_COLOR: Record<string, string> = {
  group: 'bg-primary-bg text-primary-strong dark:bg-primary-bg dark:text-primary-strong',
  event: 'bg-warning-bg text-warning dark:bg-warning-bg dark:text-warning',
  thread: 'bg-surface-elevated text-muted dark:bg-surface-elevated dark:text-subtle',
}

export function ChannelsAdminList({ visible, hidden }: { visible: ChannelRow[]; hidden: ChannelRow[] }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {visible.length === 0 && <p className="py-6 text-center text-sm text-subtle">No public channels yet.</p>}
        {visible.map((ch) => (
          <div key={ch.id} className="group flex items-center gap-3 rounded-2xl bg-surface-elevated/60 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated">
              <Hash className="h-4 w-4 text-subtle" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-text">{ch.name}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium capitalize ${TYPE_COLOR[ch.type] ?? TYPE_COLOR.group}`}>
                  {ch.type}
                </span>
                <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs font-medium capitalize text-muted">
                  {ch.scope}
                </span>
              </div>
              {ch.description && <p className="mt-0.5 truncate text-xs text-subtle">{ch.description}</p>}
            </div>
            <form action={archiveChannel.bind(null, ch.id)}>
              <button
                type="submit"
                title="Hide from discovery"
                className="rounded-lg p-1.5 text-subtle transition-all hover:bg-warning-bg hover:text-warning dark:hover:bg-warning-bg/30"
              >
                <EyeOff className="h-3.5 w-3.5" />
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
                <Hash className="h-4 w-4 shrink-0 text-subtle" />
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
