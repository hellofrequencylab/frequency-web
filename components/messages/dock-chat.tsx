'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Hash, MessageSquare, Loader2, ArrowRight, Search, Sparkles, ChevronLeft, Info } from 'lucide-react'
import { relativeTime } from '@/lib/utils'
import {
  fetchMessagesSummary,
  loadDockDmThread,
  loadDockRoomThread,
  type MessagesSummary,
} from '@/app/(main)/messages/popover-actions'
import { renameConversation, leaveConversationInPlace, openDirectConversation } from '@/app/(main)/messages/actions'
import { isError } from '@/lib/action-result'
import { MessageThread } from '@/components/messages/thread'
import { RoomThread } from '@/components/rooms/room-thread'
import { DockThreadDetails } from '@/components/messages/dock-thread-details'
import { DOCK_BACK_EVENT, type DockOpenDetail } from '@/lib/messages/dock-open'
import { dmTitle } from '@/lib/messages/dm-title'
import { IconButton } from '@/components/ui/icon-button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { buttonClasses } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'

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

/** Re-read the summary after a mutation the cache would otherwise contradict. Renaming a thread
 *  or leaving one changes the inbox, and a 20-second window of "the thread you just left is
 *  still listed" reads as a failed action. The `force` seam already existed on
 *  loadSummaryCached and had never been called with `true` by anything; this is that caller,
 *  named so the cache keeps ONE owner instead of growing a second refresh path beside it. */
export function refreshDockSummary(): Promise<MessagesSummary> {
  return loadSummaryCached(true)
}

type OpenThread = { kind: 'dm' | 'room'; id: string; title: string }
/** One hit from /api/search-handles. Structurally typed rather than imported so this component
 *  stays independent of the route module; the route is the contract. */
type HandleHit = {
  id: string
  handle: string
  display_name: string
  avatar_url: string | null
  friend_status: 'none' | 'pending_outgoing' | 'pending_incoming' | 'accepted'
}
type DmData = Awaited<ReturnType<typeof loadDockDmThread>>
type RoomData = Awaited<ReturnType<typeof loadDockRoomThread>>

// The Chat tab of the dock. Inbox-first; tapping a DM or room opens its live thread
// INLINE (no route change), so members chat without leaving the page they're on.
export function DockChat({
  onNavigate,
  onAskVera,
  requested,
  onRequestHandled,
  onThreadOpenChange,
}: {
  onNavigate?: () => void
  /** Switch the dock to Vera. The control lives HERE rather than in a strip of its own above the
   *  action bar (owner, 2026-08-12), so the launcher hands down the tab switch instead of
   *  rendering a second row for one button. */
  onAskVera?: () => void
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
  // The conversation-details layer (rename / roster / leave). A THIRD pushed view inside the
  // dock, not a modal: components/ui/dialog.tsx portals to document.body and runs its own ESC
  // handler over a module-private stack, so a dock-hosted Dialog would take one Escape while
  // the launcher's window listener took the same one, popping the thread to the inbox behind
  // an open modal. Keeping the layer in-panel keeps ESC ownership in one place.
  const [detailsOpen, setDetailsOpen] = useState(false)
  // Mirror of detailsOpen for the DOCK_BACK_EVENT listener, which is registered ONCE with []
  // deps on purpose (re-binding on every composer keystroke was the thing being avoided). Any
  // `if (detailsOpen)` written straight into that listener would read the first render's value
  // forever, so the ref is not a style choice.
  const detailsOpenRef = useRef(false)
  useEffect(() => { detailsOpenRef.current = detailsOpen }, [detailsOpen])
  const detailsButtonRef = useRef<HTMLButtonElement>(null)
  // Set after a successful leave so the inbox can announce it and take focus. Without a named
  // target, focus lands on <body> and a keyboard member restarts their tab order.
  const [leftNotice, setLeftNotice] = useState<string | null>(null)
  // The post-leave focus target. It is the SEARCH FIELD now rather than a link, because the
  // "Message someone" link it used to point at is gone (see the action bar below).
  const inboxFirstRef = useRef<HTMLInputElement>(null)

  // ── Member search (owner, 2026-08-11) ───────────────────────────────────────────────────
  // "Message someone" was a link to /people: it CLOSED the dock and navigated away, which is the
  // opposite of what a dock is for. It is a live field now, so starting a DM never leaves the page.
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<HandleHit[]>([])
  const [searching, setSearching] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  // DMs are friends-gated server-side (openDirectConversation). The refusal is a sentence meant
  // for a member, so it is rendered rather than swallowed.
  const [pickError, setPickError] = useState<string | null>(null)

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
  function back() { setOpen(null); setDm(null); setRoom(null); setAutoFocusComposer(false); setDetailsOpen(false) }

  // ── Rename, from the dock ──────────────────────────────────────────────────────────────
  // Reuses the page's `renameConversation` unchanged: it already re-reads
  // conversation_participants for the caller and refuses a non-participant, already bounds the
  // string at 120, and already maps an empty string to null. No new action, no new gate.
  //
  // It THROWS, and a thrown error inside a client-invoked server action reaches the browser as
  // an opaque production digest, so the message is never shown to the member. One plain
  // sentence instead, and never a native alert dialog (the page's behaviour, which is
  // unstyleable and, on iOS, dismisses the keyboard mid-sheet).
  async function handleRename(next: string): Promise<string | null> {
    if (!open || open.kind !== 'dm' || !dm) return 'We could not rename this conversation. Try again.'
    const conversationId = open.id
    const previousName = dm.name
    const previousTitle = open.title
    // Optimistic, with the same rollback idiom MessageThread.submit() uses for sends: the
    // trimmed-to-null rule is renameConversation's own, and the fallback label comes from the
    // shared derivation so clearing a name shows exactly what the server would return.
    const optimisticName = next.trim().slice(0, 120) || null
    setDm((cur) => (cur ? { ...cur, name: optimisticName } : cur))
    setOpen((cur) => (cur && cur.kind === 'dm' && cur.id === conversationId
      ? { ...cur, title: dmTitle(optimisticName, dm.participants, dm.myProfileId) }
      : cur))
    try {
      await renameConversation(conversationId, next)
      void refreshDockSummary().then(setData).catch(() => {})
      return null
    } catch {
      setDm((cur) => (cur ? { ...cur, name: previousName } : cur))
      setOpen((cur) => (cur && cur.kind === 'dm' && cur.id === conversationId ? { ...cur, title: previousTitle } : cur))
      return 'We could not rename this conversation. Try again.'
    }
  }

  // ── Leave, from the dock ───────────────────────────────────────────────────────────────
  // NOT `leaveConversation`: that one ends in redirect('/messages'), which from here would
  // navigate the member to the very page the dock exists to replace. Its non-navigating twin
  // shares the one delete helper, so the (self-scoped, safe-by-construction) gate cannot drift.
  async function handleLeave(): Promise<string | null> {
    if (!open || open.kind !== 'dm') return 'We could not leave this conversation. Try again.'
    const result = await leaveConversationInPlace(open.id)
    if (isError(result)) return result.error
    back()
    setLeftNotice('You left the conversation.')
    void refreshDockSummary().then(setData).catch(() => {})
    return null
  }

  // Debounced typeahead against the shared handle endpoint — the same one the composer, the
  // room inviter and the cohost manager already use, so there is one member-search behaviour in
  // the app rather than a tenth. Prefix match, capped at 6 by the RPC.
  //
  // NO setState IN THE EFFECT BODY. The obvious shape — clear on empty, flip `searching` on, then
  // schedule — puts two synchronous setState calls in an effect, which react-hooks flags as
  // cascading renders and is a real extra render per keystroke. Both moved: the clear-on-empty is
  // an event-handler concern (the input's onChange owns it, and an event handler is the right
  // place for it anyway), and `searching` flips INSIDE the timeout. That also reads better —
  // the spinner appears when a request is actually in flight, not during the 200ms of typing.
  useEffect(() => {
    const term = q.trim()
    if (!term) return
    let alive = true
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      if (!alive) return
      setSearching(true)
      try {
        const res = await fetch(`/api/search-handles?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const json = (await res.json()) as { profiles?: HandleHit[] }
        if (alive) setPeople(Array.isArray(json.profiles) ? json.profiles : [])
      } catch {
        /* aborted, offline, or rate-limited — leave the last results up rather than blanking */
      } finally {
        if (alive) setSearching(false)
      }
    }, 200)
    return () => { alive = false; clearTimeout(t); ctrl.abort() }
  }, [q])

  /** Open (or create) the DM with a picked member, in place. */
  async function startDm(p: HandleHit) {
    setPicking(p.id)
    setPickError(null)
    const res = await openDirectConversation(p.id)
    setPicking(null)
    if (!res.ok) { setPickError(res.error); return }
    // Clear the field FIRST: openDm pushes the thread view over this one, and coming back to a
    // stale query with stale results reads as the search having failed.
    setQ(''); setPeople([])
    openDm(res.conversationId, p.display_name || `@${p.handle}`)
  }

  // Focus the inbox after a leave, and clear the announcement once it has been read.
  useEffect(() => {
    if (!leftNotice) return
    const t = setTimeout(() => inboxFirstRef.current?.focus(), 20)
    const clear = setTimeout(() => setLeftNotice(null), 6000)
    return () => { clearTimeout(t); clearTimeout(clear) }
  }, [leftNotice])

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
  // The details layer adds a level ABOVE that: the panel consumes Escape itself while focus is
  // inside it, but the dock is non-modal, so a member can click the header or the page behind
  // and leave the panel focused-out. Then Escape reaches the launcher's window listener and
  // arrives here. Closing the details layer first is the only reading that never leaves the
  // inbox rendered behind a stale open panel.
  useEffect(() => {
    const onBack = () => {
      if (detailsOpenRef.current) { setDetailsOpen(false); detailsButtonRef.current?.focus(); return }
      back()
    }
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
    // The page's `isGroup` byte for byte (messages/[id]/page.tsx:98), mirrored and never
    // widened. Both mutations re-gate on the server regardless of what renders here: rename
    // re-reads participation, leave can only delete the caller's own row.
    const others = dm ? dm.participants.filter((p) => p.id !== dm.myProfileId) : []
    const isGroup = others.length > 1
    const peer = !isGroup ? others[0] : undefined
    const heading = open.title || (open.kind === 'room' ? 'Room' : 'Conversation')

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          {/* IconButton owns the density here: 32px for a mouse, 44px on a coarse pointer, so
              the dock header keeps its thumb-reachable back control without a hand-rolled box. */}
          <IconButton label="Back to inbox" onClick={back} className="-ml-1 shrink-0">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </IconButton>
          {/* Parity with the page's title: a 1:1 thread is a route to the person you are
              talking to. From the dock there was no way to reach their profile at all. */}
          {open.kind === 'dm' && peer ? (
            <Link href={`/people/${peer.handle}`} onClick={onNavigate} className="min-w-0 flex-1 truncate text-body-sm font-semibold text-text transition-opacity hover:opacity-80">
              {heading}
            </Link>
          ) : (
            <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-text">{heading}</span>
          )}
          {open.kind === 'dm' && dm && (
            <IconButton
              ref={detailsButtonRef}
              label="Conversation details"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              // Only while the layer exists: aria-controls pointing at an id that is not in
              // the document is a dangling reference, and the layer is mounted on open.
              aria-controls={detailsOpen ? 'dock-thread-details' : undefined}
              className="-mr-1 shrink-0"
            >
              <Info className="h-4 w-4" aria-hidden />
            </IconButton>
          )}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {/* `inert` on the covered thread, not a focus trap. The dock is non-modal
              (aria-modal="false"), so trapping would contradict the ARIA and break "members
              keep navigating while chatting"; what inert prevents is tabbing into a composer
              that is sitting invisibly behind the details layer and typing into nothing. */}
          <div className="h-full" inert={detailsOpen || undefined}>
            {threadLoading ? (
              <div className="flex h-full items-center justify-center text-subtle"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></div>
            ) : open.kind === 'dm' && dm ? (
              <MessageThread conversationId={open.id} initialMessages={dm.messages} myProfileId={dm.myProfileId} participants={dm.participants} autoFocus={autoFocusComposer} />
            ) : open.kind === 'room' && room ? (
              <RoomThread roomId={open.id} initialMessages={room.messages} myProfileId={room.myProfileId} canPost={room.canPost} visibility={room.visibility} />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-body-sm text-muted">Could not load this conversation.</div>
            )}
          </div>
          {/* A SIBLING of the thread, not a wrapper: MessageThread owns a realtime
              subscription (thread.tsx) that would tear down and refetch if the layer nested
              it. Mounted only while open and keyed on the conversation, so a half-typed name
              or a primed confirm can never survive into a different thread. */}
          {open.kind === 'dm' && dm && detailsOpen && (
            <DockThreadDetails
              key={open.id}
              onClose={() => { setDetailsOpen(false); detailsButtonRef.current?.focus() }}
              name={dm.name}
              participants={dm.participants}
              myProfileId={dm.myProfileId}
              canRename={isGroup}
              canLeave={isGroup}
              onRename={handleRename}
              onLeave={handleLeave}
            />
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
      {/* Both actions go through the kit's button tokens rather than two hand-rolled fill
          strings: `primarySoft` is the muted amber the dock tab already wears, `secondary` is
          the bordered neighbour. That also takes the pair off the literal `rounded-lg` step and
          onto the skinnable role radius, which is what the rest of the panel is on. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        {/* A LIVE FIELD, not a link out (owner, 2026-08-11). This was `<Link href="/people">
            Message someone</Link>`, which closed the dock and navigated away — so the one control
            for starting a conversation was also the one that ended your visit to the panel. The
            markup mirrors the launcher's own help-search field so the two in-panel searches match. */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          {/* The kit's Input, not a raw <input>. check:adoption caught the raw one the moment it
              landed (raw-input 119 → 120) and was right to: the primitive already carries the
              field surface, the focus ring and the placeholder token, so hand-rolling them here
              would drift from every other field the moment one of those changes. `pl-9` is the
              only addition — room for the icon sitting inside the box. */}
          <Input
            ref={inboxFirstRef}
            type="search"
            value={q}
            onChange={(e) => {
              const v = e.target.value
              setQ(v)
              setPickError(null)
              // Clearing the field clears its results, so reopening the search never shows
              // the previous query's members under an empty box.
              if (!v.trim()) { setPeople([]); setSearching(false) }
            }}
            placeholder="Find a member…"
            aria-label="Find a member by name or @handle"
            className="py-1.5 pl-9 text-body-sm"
          />
        </div>
        {/* ASK VERA, WHERE ROOMS USED TO BE (owner, 2026-08-12).
            Rooms was a link OUT — /messages?filter=rooms — so the second control in a panel built
            for staying put also closed it. Rooms themselves are not lost: the caller's rooms are
            listed as rows in this very inbox, and "Open all messages" still opens the full one.
            Vera is the thing worth reaching from here, and this is its only control now — the
            strip that used to hold it is gone rather than duplicated. */}
        <button type="button" onClick={onAskVera} className={buttonClasses('secondary', 'sm')}>
          <Sparkles className="h-4 w-4" aria-hidden /> Ask Vera
        </button>
      </div>

      {/* Results REPLACE the inbox while a query is live, rather than pushing it down: the panel
          is short, and a member who is searching is not reading their inbox. */}
      {q.trim() && (
        <div className="min-h-0 shrink-0 max-h-64 overflow-y-auto border-b border-border">
          {searching && people.length === 0 && (
            <div className="flex items-center justify-center py-6 text-subtle">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            </div>
          )}
          {!searching && people.length === 0 && (
            <p className="px-3 py-4 text-meta text-muted">No members match “{q.trim()}”.</p>
          )}
          <ul className="divide-y divide-border">
            {people.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => startDm(p)}
                  disabled={picking !== null}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-elevated disabled:opacity-60"
                >
                  <Avatar src={p.avatar_url} name={p.display_name || p.handle} size="sm" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-medium text-text">
                      {p.display_name || p.handle}
                    </span>
                    <span className="block truncate text-meta text-muted">@{p.handle}</span>
                  </div>
                  {picking === p.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-subtle" aria-hidden />
                  ) : (
                    /* The gate is server-side and unconditional, so saying so BEFORE the click is
                       the difference between a picker and a trap. */
                    // `text-muted`, NOT `text-subtle`: subtle at text-3xs is sub-AA by
                    // construction, and check:adoption tracks that exact pair as debt. This is
                    // the size and tone the inbox rows below already use for their timestamps.
                    p.friend_status !== 'accepted' && (
                      <span className="shrink-0 text-3xs text-muted">Not connected</span>
                    )
                  )}
                </button>
              </li>
            ))}
          </ul>
          {pickError && (
            <p role="status" aria-live="polite" className="px-3 py-2 text-meta text-danger">
              {pickError}
            </p>
          )}
        </div>
      )}

      {/* Leaving happens in the details layer, which unmounts on success, so without this the
          action would complete in silence for anyone not watching the list. */}
      <p role="status" aria-live="polite" className={leftNotice ? 'shrink-0 border-b border-border px-3 py-2 text-meta text-muted' : 'sr-only'}>
        {leftNotice ?? ''}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-10 text-subtle"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></div>
        )}
        {/* The kit's empty, not a third hand-rolled one. Same two sentences, same glyph — what
            changes is that it now carries DAWN's icon-chip anatomy and the dashed first-use
            frame, so a quiet inbox reads as a state rather than as a failed load. */}
        {empty && (
          <div className="px-3 py-4">
            <EmptyState
              icon={MessageSquare}
              title="No conversations yet."
              description="Find a member to start chatting."
            />
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
                    {/* THE kit avatar. This row hand-rolled both halves of it — a raw next/image
                        with its own focal style, and an initials disc — which is exactly the
                        duplication components/ui/avatar.tsx was extracted to end. `sm` is 36px,
                        the size this row already asked for, and the focal point still comes off
                        the URL fragment because Avatar reads it itself. */}
                    <Avatar src={peer?.avatar_url ?? null} name={title} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-body-sm font-medium text-text">{title}</span>
                        {c.lastMessage && <span className="shrink-0 text-3xs text-muted">{relativeTime(c.lastMessage.created_at)}</span>}
                      </div>
                      <span className="block truncate text-meta text-muted">{c.lastMessage?.body ?? 'No messages yet'}</span>
                    </div>
                    {/* Unread is a DANGER badge, through the kit: `bg-danger` + the minted
                        `text-on-danger`, so the count stays legible in every skin. It used to be
                        solid amber, which is the brand accent this panel spends on its tab, its
                        chips and its links — an unread has to be the one mark that is none of
                        those. */}
                    {c.unread > 0 && <Badge tone="danger" size="sm" solid className="ml-1">{c.unread}</Badge>}
                  </button>
                </li>
              )
            })}
            {rooms.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => openRoom(r.id, r.name)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-elevated">
                  {/* NOT an Avatar: a room is not a person, and DAWN's message-board draws it as
                      a hash mark rather than a face. The rounded-square keeps that distinction
                      readable at a glance beside the round avatars above it. */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-elevated text-subtle">
                    <Hash className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-body-sm font-medium text-text">{r.name}</span>
                      {r.last_message_at && <span className="shrink-0 text-3xs text-muted">{relativeTime(r.last_message_at)}</span>}
                    </div>
                    <span className="block truncate text-meta text-muted capitalize">{r.visibility} room</span>
                  </div>
                  {r.unread > 0 && <Badge tone="danger" size="sm" solid className="ml-1">{r.unread}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-2">
        <Link href="/messages" onClick={onNavigate} className="flex items-center justify-center gap-1.5 text-meta font-medium text-primary-strong hover:underline">
          Open all messages <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
