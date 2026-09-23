// THE MODAL STACK, PUBLISHED (LIVE-482).
//
// `components/ui/dialog.tsx` has always kept a module-scoped array of the open dialogs, innermost
// last, so that only the TOPMOST one answers Esc and Tab and so that a nested dialog closing does
// not release the scroll lock the one beneath it still needs. That array was private, which meant
// the rest of the app had no way to ask the one question a piece of ambient chrome most needs to
// ask: is a modal overlay covering me right now?
//
// It is a question with real consequences, because a Dialog is not a polite card. It portals to
// <body>, paints `fixed inset-0` over the whole viewport at `bg-ink/60 backdrop-blur-sm`, traps
// Tab inside its panel and swallows every pointer event on the way down. Anything underneath is
// not merely hidden. It is unreachable: it cannot be hovered, it cannot be focused, its own
// controls cannot be pressed. Chrome that keeps ANIMATING under that overlay is therefore motion
// with no pause mechanism at all, and because the overlay carries a backdrop filter, the browser
// has to re-sample and re-blur the whole viewport every time that motion changes a pixel.
//
// So the stack lives here now, as plain data with a subscription, and the Dialog is one publisher
// rather than the sole owner. Framework-free on purpose: no React import, no DOM read, nothing
// that needs a browser. That is what lets the ledger's probe import this file and exercise the
// real push, pop and notify in-process, under the CPU ceiling LIVE-034 set, instead of grepping
// the source for the shape of a fix (LIVE-475).
//
// Hand-rolled modals that predate the shared Dialog (the search overlay, the gallery lightbox, the
// page-editor bottom sheet) do NOT publish here yet. They own their own backdrop and scroll lock,
// the same way they own their own focus trap, and `components/ui/use-dialog-focus-trap.ts` records
// that split. Adding them is a one-line push/pop each when a surface needs it; claiming they are
// already covered would be worse than saying they are not.

type Listener = () => void

/** Open modals, innermost last. Module-scoped: one stack per tab, shared by every publisher. */
const stack: symbol[] = []
const listeners = new Set<Listener>()

function emit(): void {
  // A copy, so a listener that unsubscribes itself while being told cannot skip its neighbour.
  for (const listener of [...listeners]) listener()
}

/** Called by a modal when it opens. The id is any unique token; a Symbol per instance is enough. */
export function pushModal(id: symbol): void {
  stack.push(id)
  emit()
}

/** Called by a modal when it closes. Idempotent: popping an id that is not on the stack is a no-op. */
export function popModal(id: symbol): void {
  const at = stack.lastIndexOf(id)
  if (at === -1) return
  stack.splice(at, 1)
  emit()
}

/** True only for the innermost open modal. Esc and Tab belong to it and to nothing beneath it. */
export function isTopModal(id: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id
}

/** How many modals are open. The scroll lock releases only at zero. */
export function modalDepth(): number {
  return stack.length
}

/** Is anything modal covering the page? The snapshot for `useSyncExternalStore`. */
export function anyModalOpen(): boolean {
  return stack.length > 0
}

/** The server snapshot. Nothing is open before hydration, so the first client render matches. */
export function noModalOpen(): boolean {
  return false
}

/** Subscribe to opens and closes. Returns the unsubscribe. */
export function subscribeModals(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
