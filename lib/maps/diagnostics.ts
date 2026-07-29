// ONE structured line when a map fails, instead of the silence that cost three rounds.
//
// WHY THIS FILE EXISTS. Every failure mode in the map stack used to be invisible. The Google
// loader rejected with four different diagnostic strings and `google-canvas.tsx` threw all of
// them away in a bare `.catch(() => …)`; MapLibre routed every style, sprite, glyph and tile
// failure into an `error` event nobody had subscribed to. A member saw a blank cream rectangle
// with a working pin on it, and a developer with DevTools open saw nothing at all. The seam
// degraded so gracefully that it hid the thing that needed fixing.
//
// CONTRACT
//   • ONE line per distinct failure per page load. Forty failing tiles produce one line, not
//     forty — the dedupe key is the caller's, so it can choose the grain.
//   • Every line names the BUILD it came from, so "did the fix deploy?" is answerable from a
//     screenshot of the console.
//   • NEVER the key itself. `keyPresent` is a boolean. A browsable key is public by
//     construction, but printing it invites it into bug reports and screenshots.
//   • Actionable, not decorative: the line says which provider, which style, which host, and
//     what the reason was, so the next person starts at the cause rather than at zero.
//
// TRANSPORT. `console.warn` is what a developer with DevTools open reads. Client-side console
// output does NOT reach Vercel's log drains (unlike `lib/log.ts`, which is server-side), so
// when Sentry is configured we mirror the same payload to it — that is the only way a failure
// on a member's phone reaches us. The Sentry import is LAZY and DSN-gated so this module stays
// dependency-free in dev, CI and tests, where the mirror is inert.

/** The map events worth a line. Dot-namespaced like `lib/log.ts` so they aggregate. */
export type MapDiagEvent =
  /** The seam gave up on Google and re-rendered MapLibre in place. */
  | 'maps.provider_fallback'
  /** Google's own auth check failed (billing, referrer, API not enabled, bad key). */
  | 'maps.google_auth_failure'
  /** MapLibre raised an `error` event: style, sprite, glyph or tile. */
  | 'maps.maplibre_error'
  /** MapLibre reported `load` but no tile ever arrived. The blank-basemap signature. */
  | 'maps.no_tiles'

type Fields = Record<string, unknown>

// Vercel exposes the deploy's commit to the browser bundle as NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
// when "Automatically expose System Environment Variables" is on. STATIC member access, because
// NEXT_PUBLIC_* is substituted at build time and only a static access is replaced — see
// node_modules/next/dist/docs/01-app/02-guides/environment-variables.md
// §"Bundling Environment Variables for the Browser".
const BUILD_SHA = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? '').trim().slice(0, 7)

// DSN-gated so the Sentry mirror is a no-op wherever monitoring is off. Mirrors the resolution
// in lib/observability/sentry.ts, read directly rather than imported so this module pulls no
// dependency into the map chunk.
const SENTRY_DSN = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? '').trim()

/** Failure keys already reported this page load. Bounded by the number of distinct keys a
 *  page can produce, which is small; cleared only by a navigation (module re-evaluation). */
const reported = new Set<string>()

/**
 * Emit one structured, actionable line for a map failure — at most once per `dedupeKey`.
 *
 * `dedupeKey` defaults to the event name, which is the right grain for a whole-map failure
 * (fallback, no tiles). Pass a finer key when one map can fail many times in different ways,
 * e.g. `` `maps.maplibre_error:${sourceId}:${status}` ``.
 *
 * Returns true when a line was emitted, false when it was deduped — so a caller can skip
 * follow-up work without tracking its own flag.
 */
export function mapDiag(event: MapDiagEvent, fields: Fields = {}, dedupeKey?: string): boolean {
  const key = dedupeKey ?? event
  if (reported.has(key)) return false
  reported.add(key)

  const payload = {
    event,
    build: BUILD_SHA || 'unknown',
    ...fields,
  }

  // One line, JSON-shaped, greppable. `console.warn` and not `error`: a fallback that worked
  // is not a crash, and an unhandled-error overlay would be worse than the blank map.
  console.warn('[maps]', JSON.stringify(payload))

  if (SENTRY_DSN) {
    // Lazy so @sentry/nextjs is not a static dependency of the map chunk, and so a failure to
    // load the SDK can never take the map down with it.
    void import('@sentry/nextjs')
      .then((Sentry) => {
        Sentry.captureMessage(event, { level: 'warning', extra: payload })
      })
      .catch(() => {})
  }

  return true
}

/** Test-only: forget what has already been reported so a suite can exercise the first call. */
export function resetMapDiagForTests(): void {
  reported.clear()
}
