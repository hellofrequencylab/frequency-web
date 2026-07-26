// The unified Conversation Workspace (ADR-812, Phase 3) — "Apple Mail wearing ticket chrome". A
// three-region operator inbox over the comms_* spine: a segments rail (Mine / Unassigned / All), the
// conversation list, and the thread reader with its docked composer + triage controls. Server-rendered
// (RSC-first, PAGE-FRAMEWORK §5); only the composer + triage are client islands. Selection is URL-state
// (?id=), so a deep link opens straight to a thread and the back button just works.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Inbox, Lock } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import type { ActionResult } from '@/lib/action-result'
import { ConversationComposer } from './conversation-composer'
import { FollowUpButton } from './follow-up-button'
import { ConversationTriage, type TriageAgent } from './conversation-triage'
import { LiveChatBridge } from './live-chat-bridge'
import { ResizableReader, ThreadResizeHandle } from './thread-resize'
import {
  STATUS_LABELS,
  KIND_LABELS,
  DELIVERY_LABELS,
  channelLabel,
  statusTone,
  type ConversationStatus,
} from '@/lib/comms/labels'
import { makeChatToken } from '@/lib/comms/chat-token'
import type {
  ConversationListRow,
  ConversationThread,
  ConversationThreadMessage,
  ConversationScope,
} from '@/lib/comms/workspace'

/** The injectable action set — the operator inbox uses the defaults; the leader inbox passes its own. */
export interface WorkspaceActions {
  sendAction?: (input: { conversationId: string; body: string; isInternal?: boolean }) => Promise<ActionResult>
  draftAction?: (conversationId: string) => Promise<ActionResult<{ draft: string }>>
  triageAction?: (input: {
    conversationId: string
    status?: string
    priority?: string
    assignedTo?: string | null
    handoffNote?: string | null
  }) => Promise<ActionResult>
  summarizeAction?: (conversationId: string) => Promise<ActionResult<{ summary: string }>>
  aiTriageAction?: (conversationId: string) => Promise<ActionResult<{ priority: string; reason: string }>>
}

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

function hrefWith(
  basePath: string,
  base: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) params.set(k, v)
  const q = params.toString()
  return q ? `${basePath}?${q}` : basePath
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
  basePath = '/admin/crm/conversations',
  actions = {},
  showScopes = true,
  readOnly = false,
}: {
  rows: ConversationListRow[]
  thread: ConversationThread | null
  agents: TriageAgent[]
  scope: ConversationScope
  status?: string
  /** The route this workspace lives at (operator vs leader inbox). Drives every in-workspace link. */
  basePath?: string
  /** Injected server actions (reply / draft / triage / summarize). Defaults = the operator actions. */
  actions?: WorkspaceActions
  /** Hide the Mine/Unassigned/All scope tabs (the leader inbox is already scoped to their own threads). */
  showScopes?: boolean
  /** Read-only view (a staff previewer of a Space): render the thread but no composer / triage controls. */
  readOnly?: boolean
}) {
  const baseParams = { scope, status, id: thread?.id }

  return (
    <div className="space-y-3">
      {/* Segments rail: scope + status, URL-as-state. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {showScopes &&
          SCOPES.map((s) => (
            <Link
              key={s.key}
              href={hrefWith(basePath, { status }, { scope: s.key })}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                scope === s.key ? 'bg-primary text-on-primary' : 'border border-border text-muted hover:bg-surface-elevated'
              }`}
            >
              {s.label}
            </Link>
          ))}
        {showScopes && <span className="mx-1 h-4 w-px bg-border" aria-hidden />}
        <Link
          href={hrefWith(basePath, { scope }, { status: undefined })}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
            !status ? 'bg-surface-elevated text-text' : 'text-muted hover:bg-surface-elevated'
          }`}
        >
          Any status
        </Link>
        {(['open', 'waiting', 'resolved'] as const).map((st) => (
          <Link
            key={st}
            href={hrefWith(basePath, { scope }, { status: st })}
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
        // The reader bounds its own height (default: the viewport; the pull handle can stretch it), so the
        // thread scrolls INSIDE the reader and the composer stays docked no matter how long the run gets.
        // 22rem list column = the pre-regression width (narrowed by c6a418d; restored per owner directive).
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          {/* List pane. */}
          <ul className="max-h-[72vh] space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-1 lg:max-h-[calc(100dvh-13rem)]">
            {rows.map((r) => {
              const active = r.id === thread?.id
              return (
                <li key={r.id}>
                  <Link
                    href={hrefWith(basePath, baseParams, { id: r.id })}
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
                      {r.spaceName && (
                        <span className="truncate rounded-full bg-surface-elevated px-1.5 py-0.5 text-3xs font-medium text-muted">
                          {r.spaceName}
                        </span>
                      )}
                      {r.assigneeName && <span className="truncate text-3xs text-subtle">{r.assigneeName}</span>}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>

          {/* Reader pane. */}
          {thread ? (
            <ThreadReader
              thread={thread}
              agents={agents}
              actions={actions}
              readOnly={readOnly}
              // A live in-app chat gets the capability token so the reader can join the visitor's Broadcast channel.
              chatToken={thread.channel === 'in_app' ? makeChatToken(thread.ref) : null}
            />
          ) : (
            <div className="hidden rounded-lg border border-border bg-surface lg:flex lg:h-[calc(100dvh-13rem)] lg:items-center lg:justify-center">
              <p className="text-sm text-muted">Pick a conversation to read it.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ThreadReader({
  thread,
  agents,
  actions,
  readOnly,
  chatToken,
}: {
  thread: ConversationThread
  agents: TriageAgent[]
  actions: WorkspaceActions
  readOnly?: boolean
  /** For a live in-app chat: the capability token to join the visitor's Broadcast channel. */
  chatToken?: string | null
}) {
  // A live in-app chat swaps the static transcript + email composer for the real-time bridge (own message
  // list + typing + live composer). Read-only previewers still get the static transcript.
  const liveChat = thread.channel === 'in_app' && !readOnly && !!chatToken
  return (
    <ResizableReader className="flex min-h-[60vh] flex-col overflow-hidden rounded-lg border border-border bg-surface lg:min-h-0">
      <div className="flex items-start justify-between gap-2 border-b border-border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">{thread.counterpartName || 'Unknown'}</p>
          {thread.counterpartEmail && <p className="truncate text-xs text-muted">{thread.counterpartEmail}</p>}
          <p className="mt-0.5 truncate text-2xs text-subtle">
            #{thread.ref} · {thread.subject}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Ported from the retired flat inbox (ADR-820): one tap files a follow-up task on the
              contact behind this thread. Only when a CRM contact is attached and the viewer can act. */}
          {thread.contactId && !readOnly && (
            <FollowUpButton contactId={thread.contactId} contactName={thread.counterpartName} />
          )}
          <StatusPill status={thread.status} />
        </div>
      </div>

      <ContextBand thread={thread} />

      {liveChat ? (
        <>
          <ConversationTriage
            conversationId={thread.id}
            status={thread.status}
            priority={thread.priority}
            assignedTo={thread.assignedTo}
            agents={agents}
            triageAction={actions.triageAction}
            summarizeAction={actions.summarizeAction}
            aiTriageAction={actions.aiTriageAction}
          />
          <LiveChatBridge chatRef={thread.ref} token={chatToken!} />
        </>
      ) : (
        <ThreadStatic thread={thread} agents={agents} actions={actions} readOnly={readOnly} />
      )}
    </ResizableReader>
  )
}

/** The conversation's origin + what it is attached to: kind and channel, then links to the Space, the
 *  support ticket, and any event/circle the context/metadata references (only what exists). */
function ContextBand({ thread }: { thread: ConversationThread }) {
  const chips: { key: string; label: string; href: string | null }[] = []
  if (thread.spaceName) {
    chips.push({
      key: 'space',
      label: thread.spaceName,
      href: thread.spaceSlug ? `/spaces/${thread.spaceSlug}` : null,
    })
  }
  if (thread.supportTicketId) {
    chips.push({ key: 'ticket', label: 'Support ticket', href: `/admin/support/${thread.supportTicketId}` })
  }
  for (const [i, ref] of thread.contextRefs.entries()) {
    chips.push({ key: `ref-${i}`, label: ref.label, href: ref.href })
  }

  const chipClass =
    'inline-flex max-w-48 items-center truncate rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium'
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
      <span className="text-2xs text-muted">
        {KIND_LABELS[thread.kind] ?? thread.kind} · started over {channelLabel(thread.channel)}
      </span>
      {chips.map((c) =>
        c.href ? (
          <Link key={c.key} href={c.href} className={`${chipClass} text-primary hover:bg-primary/10`}>
            {c.label}
          </Link>
        ) : (
          <span key={c.key} className={`${chipClass} text-muted`}>
            {c.label}
          </span>
        ),
      )}
    </div>
  )
}

function ThreadStatic({
  thread,
  agents,
  actions,
  readOnly,
}: {
  thread: ConversationThread
  agents: TriageAgent[]
  actions: WorkspaceActions
  readOnly?: boolean
}) {
  return (
    <>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
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
            <MessageBubble key={m.id} message={m} />
          ),
        )}
      </div>

      {/* The pull handle: drag to make the chat area taller; double-click resets. */}
      <ThreadResizeHandle />

      {readOnly ? (
        <p className="border-t border-border p-3 text-2xs text-muted">
          You are previewing this space. Replying and triage are available to the space owner.
        </p>
      ) : (
        <>
          <ConversationTriage
            conversationId={thread.id}
            status={thread.status}
            priority={thread.priority}
            assignedTo={thread.assignedTo}
            agents={agents}
            triageAction={actions.triageAction}
            summarizeAction={actions.summarizeAction}
            aiTriageAction={actions.aiTriageAction}
          />
          <ConversationComposer
            conversationId={thread.id}
            counterpartName={thread.counterpartName}
            sendAction={actions.sendAction}
            draftAction={actions.draftAction}
          />
        </>
      )}
    </>
  )
}

/**
 * ONE bubble, per-channel variants (no forks): in_app = clean chat bubble, sms = compact text-message
 * style, email = an email card whose NEW content is the readable body and whose quoted trail (if any)
 * sits behind a collapsed "Show earlier messages" toggle. Every bubble carries a footer caption naming
 * how it came in (Site Message / Email / Text) plus the delivery state when it is worth knowing.
 */
function MessageBubble({ message: m }: { message: ConversationThreadMessage }) {
  const outbound = m.direction === 'outbound'
  const delivery = DELIVERY_LABELS[m.deliveryStatus]
  const deliveryTone = m.deliveryStatus === 'bounced' || m.deliveryStatus === 'failed' ? 'text-danger' : 'text-subtle'

  let bubble: ReactNode
  if (m.channel === 'email') {
    bubble = (
      <div
        className={`w-fit max-w-[88%] rounded-lg border px-3 py-2 ${
          outbound ? 'border-primary/25 bg-primary/10' : 'border-border bg-surface-elevated'
        }`}
      >
        <p className="text-2xs font-semibold text-muted">{m.authorName}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-text">{m.body}</p>
        {m.quotedTrail && (
          <details className="group mt-2 border-t border-border pt-1.5">
            <summary className="cursor-pointer list-none text-2xs font-medium text-muted hover:text-text [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show earlier messages</span>
              <span className="hidden group-open:inline">Hide</span>
            </summary>
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-subtle">{m.quotedTrail}</p>
          </details>
        )}
      </div>
    )
  } else if (m.channel === 'sms') {
    bubble = (
      <div
        className={`w-fit max-w-[70%] rounded-2xl px-3 py-1.5 ${
          outbound ? 'bg-primary/10' : 'bg-surface-elevated'
        }`}
      >
        <p className="whitespace-pre-wrap text-sm text-text">{m.body}</p>
      </div>
    )
  } else {
    bubble = (
      <div
        className={`w-fit max-w-[80%] rounded-lg px-3 py-2 ${outbound ? 'bg-primary/10' : 'bg-surface-elevated'}`}
      >
        <p className="whitespace-pre-wrap text-sm text-text">{m.body}</p>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-0.5 ${outbound ? 'items-end' : 'items-start'}`}>
      {bubble}
      <p className="px-1 text-3xs text-subtle">
        {m.authorName} · {channelLabel(m.channel)} · {when(m.occurredAt)}
        {delivery && (
          <span className={deliveryTone}> · {delivery}</span>
        )}
      </p>
    </div>
  )
}
