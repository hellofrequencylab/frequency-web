// Funnel destination — where finishing a NICHE funnel lands the new member (ADR-funnels).
// A funnel stores its post-completion target as an editable string; this validates it as a
// SAFE in-app path and fails closed to the default landing. Shared by the induction (client),
// the completion server action, and the deferred finalizer so ONE rule guards every redirect.
// Client-safe (pure string checks + a type import).

import type { FunnelDestination } from './beta-sequences'

/**
 * A URL is a SAFE in-app path only when it's a same-origin absolute path we control:
 * it starts with a single '/', is not protocol-relative ('//host' / '/\host'), and
 * carries no scheme ('://', 'javascript:', 'data:'). Anything else is an off-site /
 * open-redirect risk and is rejected. Fails closed: absent / non-string → false.
 */
export function isSafeInAppPath(url: string | null | undefined): url is string {
  if (typeof url !== 'string' || url.length === 0) return false
  if (!url.startsWith('/')) return false
  // '//host' and '/\host' are protocol-relative jumps to another origin.
  if (/^\/[/\\]/.test(url)) return false
  // Any scheme (a colon before the first '/') means it isn't a bare path.
  if (url.includes('://') || /^[^/]*:/.test(url)) return false
  return true
}

/**
 * The path a funnel's completion should land on: its direct destination when that URL is a
 * safe in-app path, otherwise the caller's default post-induction landing. Fails closed for
 * a waitlist / absent destination or an unsafe url — that keeps the General funnel on today's
 * behaviour. `fallback` is passed by the caller because the default differs per path (the
 * authed submit lands on the Vera welcome; a deferred merge lands on the bare feed).
 */
export function funnelLanding(destination: FunnelDestination | null | undefined, fallback: string): string {
  if (destination?.mode === 'direct' && isSafeInAppPath(destination.url)) return destination.url
  return fallback
}
