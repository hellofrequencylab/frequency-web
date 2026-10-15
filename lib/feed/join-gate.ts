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

// ── THE ANONYMOUS FEED (SCAN-889) ─────────────────────────────────────────────────────────────────
// Under Frequency a signed-out /feed is the real member Feed with the viewer drawn as Anonymous
// (lib/nav/anon-feed.ts). Anything that needs an account (post, like, reply, RSVP, a rail action, the
// viewer's own profile, any member page) opens the join overlay instead of acting. The overlay
// (components/frequency/members/feed/anon-join-gate.tsx) asks this one question of every link the visitor
// clicks; every button, field and form is account-only by definition.

/** Places a signed-out visitor can go from the Feed without an account: the public site, never a member page. */
const ANON_OPEN_PATHS: RegExp[] = [
  /^\/$/,
  /^\/feed$/, // the Feed itself, and its sort lens (?sort=)
  /^\/events$/,
  /^\/events\/(?!new(?:\/|$))[^/]+$/, // an event's public page; never /events/new or a sub-route
  /^\/discover(?:\/.*)?$/,
  /^\/help(?:\/.*)?$/,
  /^\/about(?:\/.*)?$/,
]

/** May a signed-out visitor on the anonymous Feed follow this href, or does it open the join overlay? */
export function anonFeedHrefAllowed(href: string | null | undefined, origin = 'https://frequency.local'): boolean {
  if (!href) return false
  // An in-page anchor (the skip link) moves focus, it does not act.
  if (href.startsWith('#')) return true
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return false
  }
  if (url.origin !== origin) return false
  return ANON_OPEN_PATHS.some((re) => re.test(url.pathname))
}
