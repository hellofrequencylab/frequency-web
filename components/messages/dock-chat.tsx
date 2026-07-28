'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Hash, Lock, MessageSquare, Loader2, ArrowRight, Users, ChevronLeft } from 'lucide-react'
import { getInitials, relativeTime } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import {
  fetchMessagesSummary,
  loadDockDmThread,
  loadDockRoomThread,
  type MessagesSummary,
} from '@/app/(main)/messages/popover-actions'
import { MessageThread } from '@/components/messages/thread'
import { RoomThread } from '@/components/rooms/room-thread'
import { DOCK_BACK_EVENT, type DockOpenDetail } from '@/lib/messages/dock-open'

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
export function DockChat({
  onNavigate,
  requested,
  onRequestHandled,
  onThreadOpenChange,
}: {
  onNavigate?: () => void
  /** A programmatic "open this thread" from the launcher (ADR-896). Before this prop the dock
   *  could ONLY be opened by clicking a row in its own inbox, so a Reconnect button had no way
   *  to reach it and had to navigate instead. */
  requested?: DockOpenDetail | null
  onRequestHandled?: () => void
  /** Lets the launcher branch ESC: back to the inbox first, close the dock second. */
  onThreadOpenChange?: (open: boolean) => void
}) {
  const [data, setData] = useState<MessagesSummary | null>(_summary)
  const [loading, setLoading] = useState(!_summary)
  const [open, setOpen] = useState<OpenThread | null>(null)
  const [dm, setDm] = useState<DmData>(null)
  const [room, setRoom] = useState<RoomData>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  // True only when the thread was opened programmatically — a member who clicked a row is
  // already looking at the dock, and stealing focus out from under their pointer is rude.
  const [autoFocusComposer, setAutoFocusComposer] = useState(false)
  const handledRef = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    loadSummaryCached()
      .then((d) => { if (alive) setData(d) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  async function openDm(id: string, title?: string) {
    // An empty title is the "caller did not know the name" sentinel; the header falls back to
    // a neutral word while the server read (which returns the authoritative title) is in flight.
    setOpen({ kind: 'dm', id, title: title ?? '' }); setThreadLoading(true); setDm(null); setRoom(null)
    const d = await loadDockDmThread(id).catch(() => null)
    setDm(d)
    if (d && !title) {
      setOpen((cur) => (cur && cur.kind === 'dm' && cur.id === id ? { ...cur, title: d.title } : cur))
    }
    setThreadLoading(false)
  }
  async function openRoom(id: string, title?: string) {
    setOpen({ kind: 'room', id, title: title ?? '' }); setThreadLoading(true); setDm(null); setRoom(null)
    const d = await loadDockRoomThread(id).catch(() => null)
    setRoom(d)
    if (d && !title) {
      setOpen((cur) => (cur && cur.kind === 'room' && cur.id === id ? { ...cur, title: d.name } : cur))
    }
    setThreadLoading(false)
  }
  function back() { setOpen(null); setDm(null); setRoom(null); setAutoFocusComposer(false) }

  // ── Honour a programmatic open ────────────────────────────────────────────────────────
  // Keyed on requestId, NOT on the thread id: a member who opens the same conversation, closes
  // the dock, then presses Message again must get it back. Keying on the id would make the
  // second press do nothing at all, which reads as a broken button.
  useEffect(() => {
    if (!requested) return
    if (handledRef.current === requested.requestId) return
    handledRef.current = requested.requestId
    // The request IS the external system here: it arrives from a button on the page, or from a
    // URL on a cold load, and there is no render-time value to derive it from.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (requested.kind === 'inbox') back()
    else {
      setAutoFocusComposer(true)
      if (requested.kind === 'dm') void openDm(requested.id, requested.title)
      else void openRoom(requested.id, requested.title)
    }
    onRequestHandled?.()
    // openDm / openRoom / back are stable within a render pass and re-running on their identity
    // would re-open the thread on every keystroke in the composer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested])

  // ESC inside a thread goes BACK to the inbox before it closes the dock. The launcher owns the
  // keydown (it owns the panel); this is the receiving half.
  useEffect(() => {
    const onBack = () => back()
    window.addEventListener(DOCK_BACK_EVENT, onBack)
    return () => window.removeEventListener(DOCK_BACK_EVENT, onBack)
  }, [])

  // Tell the launcher whether a thread is open, including on unmount (the dock unmounts this
  // component when it closes or switches to the Vera tab, and a stale `true` would swallow ESC).
  useEffect(() => {
    onThreadOpenChange?.(!!open)
  }, [open, onThreadOpenChange])
  useEffect(() => () => onThreadOpenChange?.(false), [onThreadOpenChange])

  // ── Open thread, rendered inline in the dock ──
  if (open) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <button type="button" onClick={back} aria-label="Back to inbox" className="-ml-1 rounded-lg p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <span className="truncate text-sm font-semibold text-text">{open.title || (open.kind === 'room' ? 'Room' : 'Conversation')}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {threadLoading ? (
            <div className="flex h-full items-center justify-center text-subtle"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></div>
          ) : open.kind === 'dm' && dm ? (
            <MessageThread conversationId={open.id} initialMessages={dm.messages} myProfileId={dm.myProfileId} participants={dm.participants} autoFocus={autoFocusComposer} />
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
        {/* /messages/rooms holds only an actions.ts and no page.tsx, so this 404'd — on the one
            surface the owner wants chat to live in. The rooms list is the inbox's Rooms filter. */}
        <Link href="/messages?filter=rooms" onClick={onNavigate} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated">
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
                      <Image src={avatarSrc(peer.avatar_url)} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" style={avatarFocusStyle(peer.avatar_url)} />
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
