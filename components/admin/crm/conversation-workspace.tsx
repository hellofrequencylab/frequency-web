// The unified Conversation Workspace (ADR-812, Phase 3) — "Apple Mail wearing ticket chrome". A
// three-region operator inbox over the comms_* spine: a segments rail (Mine / Unassigned / All), the
// conversation list, and the thread reader with its docked composer + triage controls. Server-rendered
// (RSC-first, PAGE-FRAMEWORK §5); only the composer + triage are client islands. Selection is URL-state
// (?id=), so a deep link opens straight to a thread and the back button just works.

import Link from 'next/link'
import { Inbox, Lock } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ConversationComposer } from './conversation-composer'
import { ConversationTriage, type TriageAgent } from './conversation-triage'
import { STATUS_LABELS, statusTone, type ConversationStatus } from '@/lib/comms/labels'
import type { ConversationListRow, ConversationThread, ConversationScope } from '@/lib/comms/workspace'

const SCOPES: { key: ConversationScope; label: string }[] = [
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'all', label: 'All' },
]

function when(at: string): string {
  const t = Date.parse(at)
  if (Number.isNaN(t)) return ''
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function hrefWith(base: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) params.set(k, v)
  const q = params.toString()
  return q ? `/admin/crm/conversations?${q}` : '/admin/crm/conversations'
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-3xs font-semibold ${statusTone(status)}`}>
      {STATUS_LABELS[status as ConversationStatus] ?? status}
    </span>
  )
}

export function ConversationWorkspace({
  rows,
  thread,
  agents,
  scope,
  status,
}: {
  rows: ConversationListRow[]
  thread: ConversationThread | null
  agents: TriageAgent[]
  scope: ConversationScope
  status?: string
}) {
  const baseParams = { scope, status, id: thread?.id }

  return (
    <div className="space-y-3">
      {/* Segments rail: scope + status, URL-as-state. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SCOPES.map((s) => (
          <Link
            key={s.key}
            href={hrefWith({ status }, { scope: s.key })}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              scope === s.key ? 'bg-primary text-on-primary' : 'border border-border text-muted hover:bg-surface-elevated'
            }`}
          >
            {s.label}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Link
          href={hrefWith({ scope }, { status: undefined })}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
            !status ? 'bg-surface-elevated text-text' : 'text-muted hover:bg-surface-elevated'
          }`}
        >
          Any status
        </Link>
        {(['open', 'waiting', 'resolved'] as const).map((st) => (
          <Link
            key={st}
            href={hrefWith({ scope }, { status: st })}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              status === st ? 'bg-surface-elevated text-text' : 'text-muted hover:bg-surface-elevated'
            }`}
          >
            {STATUS_LABELS[st]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No conversations here"
          description="When a ticketed send goes out or a reply comes in, the thread shows up in this view."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          {/* List pane. */}
          <ul className="max-h-[72vh] space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-1">
            {rows.map((r) => {
              const active = r.id === thread?.id
              return (
                <li key={r.id}>
                  <Link
                    href={hrefWith(baseParams, { id: r.id })}
                    className={`block rounded-md px-3 py-2 ${active ? 'bg-surface-elevated' : 'hover:bg-surface-elevated'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-text">
                        {r.counterpartName || r.counterpartEmail || 'Unknown'}
                      </span>
                      <span className="shrink-0 text-3xs text-muted">{when(r.lastActivityAt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {r.awaitingReply && (
                        <span className="inline-block size-1.5 shrink-0 rounded-full bg-primary" aria-label="Awaiting reply" />
                      )}
                      <span className="truncate text-xs text-muted">{r.snippet || r.subject}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <StatusPill status={r.status} />
                      {r.assigneeName && <span className="truncate text-3xs text-subtle">{r.assigneeName}</span>}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>

          {/* Reader pane. */}
          {thread ? (
            <ThreadReader thread={thread} agents={agents} />
          ) : (
            <div className="hidden rounded-lg border border-border bg-surface lg:flex lg:items-center lg:justify-center">
              <p className="text-sm text-muted">Pick a conversation to read it.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ThreadReader({ thread, agents }: { thread: ConversationThread; agents: TriageAgent[] }) {
  return (
    <div className="flex min-h-[60vh] flex-col rounded-lg border border-border bg-surface">
      <div className="flex items-start justify-between gap-2 border-b border-border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">{thread.counterpartName || 'Unknown'}</p>
          {thread.counterpartEmail && <p className="truncate text-xs text-muted">{thread.counterpartEmail}</p>}
          <p className="mt-0.5 truncate text-2xs text-subtle">
            #{thread.ref} · {thread.subject}
          </p>
        </div>
        <StatusPill status={thread.status} />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {thread.messages.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
        {thread.messages.map((m) =>
          m.isInternal ? (
            <div key={m.id} className="rounded-lg border border-warning/40 bg-warning-bg/50 px-3 py-2">
              <p className="flex items-center gap-1 text-2xs uppercase tracking-wide text-warning">
                <Lock className="h-3 w-3" /> Note · {m.authorName} · {when(m.occurredAt)}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-text">{m.body}</p>
            </div>
          ) : (
            <div key={m.id} className={m.direction === 'outbound' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  m.direction === 'outbound' ? 'bg-primary/10 text-text' : 'bg-surface-elevated text-text'
                }`}
              >
                <p className="text-2xs uppercase tracking-wide text-muted">
                  {m.authorName} · {m.channel} · {when(m.occurredAt)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{m.body}</p>
              </div>
            </div>
          ),
        )}
      </div>

      <ConversationTriage
        conversationId={thread.id}
        status={thread.status}
        priority={thread.priority}
        assignedTo={thread.assignedTo}
        agents={agents}
      />
      <ConversationComposer conversationId={thread.id} counterpartName={thread.counterpartName} />
    </div>
  )
}
