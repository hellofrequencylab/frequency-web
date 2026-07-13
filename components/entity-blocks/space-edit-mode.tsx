'use client'

import { useSyncExternalStore } from 'react'

// LIVE-PAGE EDIT MODE — a tiny cross-tree signal: is the Space owner editing the page (the admin rail open
// on a Space profile)? The admin bar OWNS the open state (admin-bar.tsx) and pushes it here; the live
// profile grid READS it to flip its content blocks from the read-only render (ContentBlockView) to the
// on-page inline editors (SpaceCanvasBlock). Decoupled by a module-level store so neither surface imports
// the other and the signal survives the same-route slide-over with no prop drilling through the app shell.
//
// This is the "Edit Space" model (owner directive): clicking Edit Space opens the rail (settings + the row
// arranger) AND turns every content block editable IN PLACE on the page; closing the rail returns the page
// to its normal read-only render. SSR-safe: the server snapshot is always false, so a server render or the
// no-provider fallback path never edits.

let editing = false
const listeners = new Set<() => void>()

/** Set the live-page edit mode. Called only by the admin bar when its open state (on a Space scope) changes.
 *  A no-op when the value is unchanged, so repeated broadcasts never churn subscribers. */
export function setSpaceEditMode(next: boolean): void {
  if (editing === next) return
  editing = next
  for (const listener of listeners) listener()
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/** Read whether the Space owner is in live-page edit mode. Server snapshot is always false (fail-safe). */
export function useSpaceEditMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => editing,
    () => false,
  )
}
