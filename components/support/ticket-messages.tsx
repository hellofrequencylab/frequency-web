import { Sparkles, Lock, Shield } from 'lucide-react'
import { relativeTime } from '@/lib/utils'
import type { TicketMessage } from '@/lib/support/types'

// Renders a ticket's conversation. Member replies sit on the right; staff/vera/system
// on the left. Internal staff notes get a distinct, locked treatment (only shown on
// the admin thread — the member query never returns them).
export function TicketMessages({ messages }: { messages: TicketMessage[] }) {
  if (messages.length === 0) {
    return <p className="py-4 text-center text-xs text-subtle">No messages yet.</p>
  }
  return (
    <div className="space-y-3">
      {messages.map((m) => {
        if (m.isInternal) {
          return (
            <div key={m.id} className="rounded-xl border border-warning/40 bg-warning-bg/30 px-3 py-2">
              <p className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-warning">
                <Lock className="h-3 w-3" /> Internal note · {m.authorName ?? 'Staff'} · {relativeTime(m.createdAt)}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{m.body}</p>
            </div>
          )
        }
        const mine = m.authorKind === 'member'
        const Icon = m.authorKind === 'vera' ? Sparkles : m.authorKind === 'staff' ? Shield : null
        return (
          <div key={m.id} className={mine ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
            <p className="mb-0.5 flex items-center gap-1 px-1 text-2xs text-subtle">
              {Icon && <Icon className="h-3 w-3 text-primary-strong" />}
              <span className="font-semibold text-muted">
                {mine ? 'You' : m.authorKind === 'vera' ? 'Vera' : m.authorName ?? 'Support'}
              </span>
              · {relativeTime(m.createdAt)}
            </p>
            <div
              className={
                mine
                  ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-on-primary'
                  : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-border bg-surface-elevated px-3.5 py-2 text-sm text-text'
              }
            >
              {m.body}
            </div>
          </div>
        )
      })}
    </div>
  )
}
