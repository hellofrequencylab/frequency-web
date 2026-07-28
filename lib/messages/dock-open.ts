// ── Opening the chat dock from anywhere (ADR-896, chat consolidation) ─────────────────────
// The owner's directive is that chat happens in the lower-right dock, not on its own page.
// Honouring it needs an "open the dock at THIS conversation" mechanism, and before this module
// the product had none:
//   • the launcher's existing `open-chat` listener took no `detail` (vera-launcher.tsx), so a
//     caller could open the Messages tab but never a named thread;
//   • DockChat's open thread was settable only by clicking a row in its own inbox;
//   • the dock panel is conditionally mounted, so any state set before it opens is discarded.
// Everything below exists to close that gap, and nothing here imports React or the DOM at
// module scope, so a Server Component may import the constants safely.
//
// TWO channels, because one is not enough:
//   • a CustomEvent, for an open that happens on the page the member is already looking at (a
//     Reconnect button). No navigation, so their scroll position survives — the actual defect.
//   • a `?chat=dm|room|inbox&thread=<id>` query param, for an open that must survive a FULL
//     PAGE LOAD. An event dispatched before the launcher mounts is lost with no trace, so a
//     server redirect (the Phase 2 retirement gate) and any pasted deep link must use the URL.
// The query channel ships now even though nothing produces such a URL yet: it is the landing
// pad the retirement redirect needs, and shipping it late means shipping the flag untested.
//
// `parseDockRequest` and `stripDockParams` are PURE and unit-tested. URL handling is where
// "worked when I clicked it" bugs live, and neither one may touch `window`.

/** The event the launcher listens on. Kept as the pre-existing name so older dispatchers of a
 *  bare `new Event('open-chat')` keep working (they simply carry no detail). */
export const DOCK_OPEN_EVENT = 'open-chat'

/** Ask an open thread to go back to the inbox. The launcher fires this on the first ESC so a
 *  member reading a conversation does not lose the whole dock on one keystroke. */
export const DOCK_BACK_EVENT = 'dock-chat-back'

export const DOCK_PARAM = 'chat'
export const DOCK_THREAD_PARAM = 'thread'

/** What the dock should show. `inbox` is a real request, not a null: it is how a caller sends
 *  an already-open thread back to the list. */
export type DockOpenRef =
  | { kind: 'dm' | 'room'; id: string; title?: string }
  | { kind: 'inbox' }

/** A ref stamped with an id. The dock keys "have I handled this?" on `requestId`, so asking
 *  twice for the SAME thread still re-opens it (a member pressing Message again after closing
 *  the dock must not be met with silence). */
export type DockOpenDetail = DockOpenRef & { requestId: string }

let _seq = 0

/** Monotonic within one page lifetime, which is all the dock's handled-check needs. */
export function nextDockRequestId(): string {
  _seq += 1
  return `dock-${_seq}`
}

/**
 * Read a dock request out of a query string. Accepts the string with or without the leading
 * `?`, and ignores every other param, so this composes with a page that has its own.
 */
export function parseDockRequest(search: string): DockOpenRef | null {
  const raw = search.startsWith('?') ? search.slice(1) : search
  if (!raw) return null
  const params = new URLSearchParams(raw)
  const kind = params.get(DOCK_PARAM)
  if (!kind) return null

  if (kind === 'dm' || kind === 'room') {
    const id = params.get(DOCK_THREAD_PARAM)?.trim()
    // `?chat=dm` with no thread is a half-formed link (a truncated paste, a redirect built
    // from a null id). Open the inbox rather than drop it: the member asked for chat, and
    // silence is the worse failure of the two.
    if (!id) return { kind: 'inbox' }
    return { kind, id }
  }
  if (kind === 'inbox') return { kind: 'inbox' }

  // An unrecognised value is not a reason to pop a panel open over someone's page.
  return null
}

/** Where a dock deep link lands when the caller has no better page in mind. The launcher lives
 *  in the `(main)` layout, so the destination only has to be a page inside it; the feed is the
 *  member's home surface and the least surprising place to be left holding a conversation. */
export const DOCK_DEFAULT_PATH = '/feed'

/**
 * Build the URL form of a dock request: the counterpart to `parseDockRequest`, and the ONLY
 * place the `?chat=…&thread=…` shape is written. A server `redirect()` cannot dispatch an
 * event, so the retirement gate (ADR-896 Phase 2) has to hand the request over in the URL, and
 * a hand-rolled template string on the other side of that handoff is how deep links rot.
 * Pure, and round-tripped against `parseDockRequest` in the tests.
 */
export function dockThreadPath(basePath: string, ref: DockOpenRef): string {
  const [path, existing = ''] = basePath.split('?')
  const params = new URLSearchParams(existing)
  params.set(DOCK_PARAM, ref.kind)
  if (ref.kind === 'dm' || ref.kind === 'room') params.set(DOCK_THREAD_PARAM, ref.id)
  else params.delete(DOCK_THREAD_PARAM)
  return `${path}?${params.toString()}`
}

/**
 * The same URL with the dock params removed, for `history.replaceState`. Every other param is
 * preserved in order, so stripping the dock request never eats a page's own filter state.
 */
export function stripDockParams(pathname: string, search: string): string {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(raw)
  params.delete(DOCK_PARAM)
  params.delete(DOCK_THREAD_PARAM)
  const rest = params.toString()
  return rest ? `${pathname}?${rest}` : pathname
}

function dispatch(ref: DockOpenRef): void {
  if (typeof window === 'undefined') return
  const detail: DockOpenDetail = { ...ref, requestId: nextDockRequestId() }
  window.dispatchEvent(new CustomEvent(DOCK_OPEN_EVENT, { detail }))
}

/** Open the dock on a specific conversation or room, in place, with no navigation. */
export function openDockThread(ref: { kind: 'dm' | 'room'; id: string; title?: string }): void {
  dispatch(ref)
}

/** Open the dock on the inbox (and send an open thread back to the list). */
export function openDockInbox(): void {
  dispatch({ kind: 'inbox' })
}
