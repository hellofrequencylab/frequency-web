'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Hash, Lock, MessageSquare, Loader2, ArrowRight, Users, ChevronLeft } from 'lucide-react'
import { getInitials, relativeTime } from '@/lib/utils'
import {
  fetchMessagesSummary,
  loadDockDmThread,
  loadDockRoomThread,
  type MessagesSummary,
} from '@/app/(main)/messages/popover-actions'
import { MessageThread } from '@/components/messages/thread'
import { RoomThread } from '@/components/rooms/room-thread'

// Module-level cache so reopening the dock is INSTANT (the summary is a few RPCs, which
// is what felt slow). Warmed by the launcher on mount (prefetchDockSummary) and refreshed
// on each open. Survives panel close/reopen because it lives outside the component.
let _summary: MessagesSummary | null = null
let _summaryAt = 0
const STALE_MS = 20_000

export async function prefetchDockSummary(): Promise<void> {
  try {
    _summary = await fetchMessagesSummary()
    _summaryAt = Date.now()
  } catch {
    /* best-effort warm */
  }
}
async function loadSummaryCached(force = false): Promise<MessagesSummary> {
  if (!force && _summary && Date.now() - _summaryAt < STALE_MS) return _summary
  const d = await fetchMessagesSummary()
  _summary = d
  _summaryAt = Date.now()
  return d
}

type OpenThread = { kind: 'dm' | 'room'; id: string; title: string }
type DmData = Awaited<ReturnType<typeof loadDockDmThread>>
type RoomData = Awaited<ReturnType<typeof loadDockRoomThread>>

// The Chat tab of the dock. Inbox-first; tapping a DM or room opens its live thread
// INLINE (no route change), so members chat without leaving the page they're on.
export function DockChat({ onNavigate }: { onNavigate?: () => void }) {
  const [data, setData] = useState<MessagesSummary | null>(_summary)
  const [loading, setLoading] = useState(!_summary)
  const [open, setOpen] = useState<OpenThread | null>(null)
  const [dm, setDm] = useState<DmData>(null)
  const [room, setRoom] = useState<RoomData>(null)
  const [threadLoading, setThreadLoading] = useState(false)

  useEffect(() => {
    let alive = true
    loadSummaryCached()
      .then((d) => { if (alive) setData(d) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  async function openDm(id: string, title: string) {
    setOpen({ kind: 'dm', id, title }); setThreadLoading(true); setDm(null); setRoom(null)
    const d = await loadDockDmThread(id).catch(() => null)
    setDm(d); setThreadLoading(false)
  }
  async function openRoom(id: string, title: string) {
    setOpen({ kind: 'room', id, title }); setThreadLoading(true); setDm(null); setRoom(null)
    const d = await loadDockRoomThread(id).catch(() => null)
    setRoom(d); setThreadLoading(false)
  }
  function back() { setOpen(null); setDm(null); setRoom(null) }

  // ── Open thread, rendered inline in the dock ──
  if (open) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <button type="button" onClick={back} aria-label="Back to inbox" className="-ml-1 rounded-lg p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <span className="truncate text-sm font-semibold text-text">{open.title}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {threadLoading ? (
            <div className="flex h-full items-center justify-center text-subtle"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></div>
          ) : open.kind === 'dm' && dm ? (
            <MessageThread conversationId={open.id} initialMessages={dm.messages} myProfileId={dm.myProfileId} participants={dm.participants} />
          ) : open.kind === 'room' && room ? (
            <RoomThread roomId={open.id} initialMessages={room.messages} myProfileId={room.myProfileId} canPost={room.canPost} />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">Could not load this conversation.</div>
          )}
        </div>
      </div>
    )
  }

  // ── Inbox ──
  const rooms = data?.rooms ?? []
  const conversations = data?.conversations ?? []
  const empty = !loading && rooms.length === 0 && conversations.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Link href="/people" onClick={onNavigate} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-bg px-3 py-1.5 text-sm font-medium text-primary-strong transition-colors hover:bg-primary-bg/70">
          <Users className="h-4 w-4" aria-hidden /> Message someone
        </Link>
        <Link href="/messages/rooms" onClick={onNavigate} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated">
          <Hash className="h-4 w-4" aria-hidden /> Rooms
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-10 text-subtle"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></div>
        )}
        {empty && (
          <div className="px-4 py-10 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-subtle" aria-hidden />
            <p className="mt-2 text-sm text-muted">No conversations yet.</p>
            <p className="mt-0.5 text-xs text-subtle">Find a member to start chatting.</p>
          </div>
        )}
        {!loading && !empty && (
          <ul className="divide-y divide-border">
            {conversations.map((c) => {
              const peer = c.participants[0]
              const title = c.name ?? peer?.display_name ?? 'Conversation'
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => openDm(c.id, title)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-elevated">
                    {peer?.avatar_url ? (
                      <Image src={peer.avatar_url} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-2xs font-bold text-primary-strong select-none">{getInitials(title)}</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-text">{title}</span>
                        {c.lastMessage && <span className="shrink-0 text-3xs text-subtle">{relativeTime(c.lastMessage.created_at)}</span>}
                      </div>
                      <span className="block truncate text-xs text-muted">{c.lastMessage?.body ?? 'No messages yet'}</span>
                    </div>
                    {c.unread > 0 && <span className="ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold text-on-primary">{c.unread}</span>}
                  </button>
                </li>
              )
            })}
            {rooms.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => openRoom(r.id, r.name)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-elevated">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-subtle">
                    {r.visibility === 'private' ? <Lock className="h-4 w-4" aria-hidden /> : <Hash className="h-4 w-4" aria-hidden />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-text">{r.name}</span>
                      {r.last_message_at && <span className="shrink-0 text-3xs text-subtle">{relativeTime(r.last_message_at)}</span>}
                    </div>
                    <span className="block truncate text-xs text-muted capitalize">{r.visibility} room</span>
                  </div>
                  {r.unread > 0 && <span className="ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold text-on-primary">{r.unread}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-2">
        <Link href="/messages" onClick={onNavigate} className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary-strong hover:underline">
          Open all messages <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
