'use client'

// ── "You have work nobody else can see yet" ───────────────────────────────────────────────
//
// A tiny module-scope flag, because the two components that need to agree about this live in
// DIFFERENT React trees and there is no common provider:
//
//   SETS it    components/entity-blocks/space-publish-fab.tsx — inside the page body, under the
//              profile-layout store, so it is the only thing that knows about autosave + draft
//   READS it   components/layout/admin-bar/admin-bar.tsx — a sibling in the app shell, outside
//              that provider entirely
//
// Lifting a provider high enough to cover both would mean wrapping the whole shell in the page
// editor's context, which is backwards: the shell must not depend on the editor.
//
// 🔴 WHY IT EXISTS AT ALL. Owner report: layout edits sat unpublished for days and read as a
// rendering bug ("I changed events to the card view, but they are not showing up"). Autosave makes
// that worse rather than better — "Draft · Saved" is literally true and reads as "live". The page
// looked finished, so "not published" was indistinguishable from "broken", and closing the edit
// panel gave no signal at all.
//
// Deliberately NOT a store: it holds one boolean, it is read at the moment of a click, and it must
// survive a component in another tree unmounting. A module variable plus a subscription is the
// honest shape. Reset on unmount by the setter's own effect cleanup.

type Listener = (dirty: boolean) => void

let dirty = false
const listeners = new Set<Listener>()

/** True when there is either an autosave in flight OR a draft the public cannot see yet. */
export function hasUnpublishedWork(): boolean {
  return dirty
}

/** Called by the publish bar whenever either state changes. Idempotent. */
export function setUnpublishedWork(next: boolean): void {
  if (next === dirty) return
  dirty = next
  for (const l of listeners) l(next)
}

/** Subscribe (the admin bar, so its close button can re-render into a warning state). Returns an
 *  unsubscribe, and fires immediately with the current value so a late subscriber is not stale. */
export function subscribeUnpublishedWork(fn: Listener): () => void {
  listeners.add(fn)
  fn(dirty)
  return () => {
    listeners.delete(fn)
  }
}

/** The one sentence shown when someone tries to close the editor with work pending. Kept here so
 *  the panel and any future surface cannot word it differently. No em dashes (CONTENT-VOICE). */
export const UNPUBLISHED_WARNING =
  'You have changes that are saved but not published. Nobody else can see them until you hit Publish. Close anyway?'
