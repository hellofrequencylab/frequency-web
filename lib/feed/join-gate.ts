// THE FEED PREVIEW'S JOIN PROMPT (owner, 2026-10-14): "When a logged out visitor clicks [Feed], it opens
// the feed with a 30 second timeout popup for them to sign up for a free membership to view."
//
// The clock starts the first time the visitor opens the preview in this browser tab and is kept in
// sessionStorage, so a reload does not buy another 30 seconds. Pure and client-safe:
// components/feed/feed-join-gate.tsx is the only caller, and join-gate.test.ts drives it directly.

/** How long a signed-out visitor reads the Feed before the free-membership prompt. */
export const FEED_PREVIEW_MS = 30_000

/** The sessionStorage key that holds when this tab's preview started (epoch ms). */
export const FEED_PREVIEW_KEY = 'fq_feed_preview_started'

/** When the preview started: the stored stamp if it is a sane past time, else `now`. */
export function previewStartedAt(stored: string | null, now: number): number {
  const t = stored == null ? NaN : Number(stored)
  return Number.isFinite(t) && t > 0 && t <= now ? t : now
}

/** Milliseconds left before the prompt, never below zero. */
export function previewRemainingMs(startedAt: number, now: number): number {
  return Math.max(0, startedAt + FEED_PREVIEW_MS - now)
}
