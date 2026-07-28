'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { X, Loader2, LogOut, Pencil } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'

// ── The conversation console the dock was missing (ADR-896 parity) ────────────────────────
// Rename, leave and the participant roster lived ONLY on app/(main)/messages/[id]/page.tsx,
// which is why `chat_dm_routes_retired` could not be flipped: retiring the page would have
// taken three capabilities with it. This is where they land instead.
//
// PROGRESSIVE DISCLOSURE, not a cramped clone of the page. 24rem cannot host the page's
// side-by-side layout (a 16rem aside beside a thread), so this is a PUSHED LAYER over the
// thread body: the resting conversation gains exactly one icon button, and everything else
// stays behind it. Inside the layer the order is what the thread is called, then who is in
// it (the tallest part, and the only scroller), then leaving (destructive, last, confirmed).
//
// PRESENTATIONAL BY CONTRACT. It imports no server action and holds no conversation id; the
// caller injects `onRename` / `onLeave`. Two reasons, both load-bearing: importing a server
// action module would drag @/lib/supabase/admin into the a11y render test and the component
// would never mount, and keeping the action wiring in DockChat keeps the cache invalidation
// next to the cache it invalidates.

export type DetailsPeer = { id: string; display_name: string; handle: string; avatar_url: string | null }

// MOUNTED ONLY WHILE OPEN, and keyed on the conversation id by the caller. That is what makes
// every piece of state below (a half-typed name, a primed "Yes, leave") reset on each open
// without a single reset effect: unmounting IS the reset, which is the React-recommended
// answer to "synchronise state on a prop change" and the reason this file has no
// setState-in-an-effect. Nothing here holds a subscription, so the unmount costs nothing; the
// thread underneath is a SIBLING and stays mounted, so its realtime channel never tears down.
export function DockThreadDetails({
  onClose,
  name,
  participants,
  myProfileId,
  canRename,
  canLeave,
  onRename,
  onLeave,
}: {
  onClose: () => void
  /** The RAW conversations.name, never the derived title. See loadDockDmThread. */
  name: string | null
  participants: DetailsPeer[]
  myProfileId: string
  /** Mirrors the page's `isGroup` gate byte for byte. Mirrored, never widened: the server
   *  re-gates both mutations regardless of what is rendered here. */
  canRename: boolean
  canLeave: boolean
  /** Resolve to an error sentence, or null on success. */
  onRename: (next: string) => Promise<string | null>
  onLeave: () => Promise<string | null>
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const renameTriggerRef = useRef<HTMLButtonElement>(null)
  const leaveTriggerRef = useRef<HTMLButtonElement>(null)

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name ?? '')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  const [confirming, setConfirming] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  // Focus moves INTO the layer on mount. The dock is non-modal by design (aria-modal="false"
  // on the launcher panel), so there is deliberately NO focus trap: a member must be able to
  // keep tabbing through the page behind it. What the layer does owe them is a landing spot,
  // which is this container.
  useEffect(() => {
    const t = setTimeout(() => panelRef.current?.focus(), 20)
    return () => clearTimeout(t)
  }, [])

  // ESC LAYERING, solved without touching the launcher. The launcher binds keydown on `window`
  // (bubble phase, no capture flag), and window is the LAST node in the bubble path, so
  // stopping propagation here means it never sees the keystroke. Four levels, innermost first:
  // cancel the rename, cancel the confirm, close this layer, and only then the launcher's own
  // "back to the inbox". If anyone ever moves the launcher's listener to the capture phase this
  // silently stops working, which is why the drift guard pins its signature.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    if (editing) { cancelRename(); return }
    if (confirming) { cancelLeave(); return }
    onClose()
  }

  // Each collapsed affordance REPLACES its trigger when it expands, so at the moment we
  // collapse it the trigger is not in the DOM yet and `ref.current` is still null. Focusing
  // synchronously here would be a silent no-op and would strand a keyboard member on <body>.
  // A macrotask runs after React has committed the re-render, which is the cheapest correct
  // point; an effect would mean setState-in-an-effect, which is what this file is shaped to
  // avoid.
  function focusAfterRender(ref: React.RefObject<HTMLButtonElement | null>) {
    setTimeout(() => ref.current?.focus(), 0)
  }

  function cancelRename() {
    setEditing(false); setValue(name ?? ''); setRenameError(null)
    focusAfterRender(renameTriggerRef)
  }
  function cancelLeave() {
    setConfirming(false); setLeaveError(null)
    focusAfterRender(leaveTriggerRef)
  }

  async function saveRename() {
    setRenaming(true); setRenameError(null)
    const err = await onRename(value)
    setRenaming(false)
    // A failure keeps the field open with the typed value intact, so there is nothing to
    // restore focus to: the caret is already where the member left it.
    if (err) { setRenameError(err); return }
    setEditing(false)
    focusAfterRender(renameTriggerRef)
  }

  async function confirmLeave() {
    setLeaving(true); setLeaveError(null)
    const err = await onLeave()
    setLeaving(false)
    // On success the caller unmounts this whole layer and moves focus itself, so there is
    // nothing to restore here. On failure the confirm collapses, so focus follows it back to
    // the trigger that now carries the error sentence.
    if (err) { setLeaveError(err); setConfirming(false); focusAfterRender(leaveTriggerRef) }
  }

  return (
    <div
      ref={panelRef}
      id="dock-thread-details"
      role="group"
      aria-label="Conversation details"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      // absolute, NEVER fixed: on a phone the dock is a bottom sheet, and a fixed child would
      // escape it and sit under the browser toolbar. inset-0 keeps the layer inside the body
      // of the sheet, under the header that still carries Back.
      className="absolute inset-0 z-10 flex min-h-0 flex-col bg-surface outline-none"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-text">Details</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="-mr-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* min-h-0 + a single scrolling child: the roster is the only thing that scrolls, so a
          25-person group (GROUP_DM_CAP) can never push Leave off the bottom of a phone sheet. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {canRename && (
          <div className="shrink-0 border-b border-border px-3 py-2.5">
            {editing ? (
              <div>
                <label htmlFor="dock-conversation-name" className="block text-2xs font-semibold uppercase tracking-wider text-subtle">
                  Group name
                </label>
                <input
                  id="dock-conversation-name"
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveRename() } }}
                  autoFocus
                  disabled={renaming}
                  aria-busy={renaming}
                  // text-base below sm: iOS Safari zooms the viewport for any input under 16px,
                  // and a zoom-and-restore jump inside a 68dvh sheet is far worse than on a page.
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-base text-text outline-none focus:border-border-strong focus:ring-1 focus:ring-border-strong/30 sm:text-sm"
                />
                <p className="mt-1 text-3xs text-subtle">Leave it blank to go back to the members&rsquo; names.</p>
                {renameError && <p role="alert" className="mt-1 text-xs text-danger">{renameError}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveRename()}
                    disabled={renaming}
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {renaming && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelRename}
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-subtle">Group name</p>
                  <p className="truncate text-sm text-text">{name || 'Not set'}</p>
                </div>
                <button
                  ref={renameTriggerRef}
                  type="button"
                  onClick={() => { setEditing(true); setRenameError(null) }}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Rename
                </button>
              </div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <h3 className="px-3 pt-2.5 pb-1 text-2xs font-semibold uppercase tracking-wider text-subtle">
            People ({participants.length})
          </h3>
          <ul className="divide-y divide-border/50">
            {participants.map((p) => (
              <li key={p.id}>
                {/* The roster is a mobile GAIN, not a port: the page hides its aside below the
                    lg breakpoint, so under 1024px there has never been a way to see who is in a
                    conversation. Rows are >= 44px so they are a real touch target on a phone. */}
                <Link
                  href={`/people/${p.handle}`}
                  className="flex min-h-11 items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-elevated"
                >
                  {p.avatar_url ? (
                    <Image src={avatarSrc(p.avatar_url)} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover" style={avatarFocusStyle(p.avatar_url)} />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-primary-bg text-3xs font-semibold text-primary-strong">
                      {getInitials(p.display_name)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-text">
                      {p.display_name}
                      {p.id === myProfileId && <span className="ml-1 font-normal text-subtle">(You)</span>}
                    </span>
                    <span className="block truncate text-3xs text-subtle">@{p.handle}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {canLeave && (
          <div className="shrink-0 border-t border-border px-3 py-2.5">
            {confirming ? (
              <div>
                <p className="text-sm font-medium text-text">Leave this conversation?</p>
                <p className="mt-0.5 text-xs text-muted">You will stop getting its messages. The others stay.</p>
                {leaveError && <p role="alert" className="mt-1 text-xs text-danger">{leaveError}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void confirmLeave()}
                    disabled={leaving}
                    aria-busy={leaving}
                    autoFocus
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger px-3 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {leaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} Yes, leave
                  </button>
                  <button
                    type="button"
                    onClick={cancelLeave}
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {leaveError && <p role="alert" className="mb-1 text-xs text-danger">{leaveError}</p>}
                {/* Two steps, and NOT the browser's native confirm: that dialog is unstyleable
                    and untestable, and on iOS it dismisses the keyboard and can freeze a
                    mid-animation bottom sheet. The page has no confirmation at all today, so
                    this is strictly safer than the surface it replaces. */}
                <button
                  ref={leaveTriggerRef}
                  type="button"
                  onClick={() => { setConfirming(true); setLeaveError(null) }}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-danger px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-bg"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden /> Leave conversation
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
