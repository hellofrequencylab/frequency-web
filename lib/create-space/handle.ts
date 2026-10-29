// The handle check on /create-a-space, the pure half: what the public check answers and what the name card shows.
// The check says one of three things and nothing else: free, taken, or not a handle. The rule for "a handle" is the
// builder's own (isValidHandle) AND the one the Space route enforces (isSafeSlug), so a handle that passes here is one
// createSpace accepts. PURE and client-safe.

import { isSafeSlug } from '@/lib/theme/validate'
import { isValidHandle } from '@/lib/create-space/builder'

type HandleVerdict = 'free' | 'taken' | 'invalid'

/** What the name card knows about the handle: a verdict, or still asking, or no answer (offline, throttled). */
export type HandleStatus = HandleVerdict | 'checking' | 'unknown' | 'idle'

/** Whether `handle` has the shape of a Space handle, before anyone is asked whether it is free. Total. */
export function isHandleShape(handle: unknown): handle is string {
  return typeof handle === 'string' && isValidHandle(handle) && isSafeSlug(handle)
}

/** The verdict for a handle given what the Spaces table said: `taken` true, false, or null when the read failed.
 *  Null has no verdict (the route answers with an error, never "free"). Pure so the route's decision is testable. */
export function verdictFor(handle: unknown, taken: boolean | null): HandleVerdict | null {
  if (!isHandleShape(handle)) return 'invalid'
  if (taken === null) return null
  return taken ? 'taken' : 'free'
}

/** The check's answer read back by the page. Anything off the closed shape reads as no answer. Total. */
export function parseVerdict(body: unknown): HandleVerdict | null {
  const status = (body as { status?: unknown } | null)?.status
  return status === 'free' || status === 'taken' || status === 'invalid' ? status : null
}

/** A handle to try when this one is taken: the same handle with "hq" after it, kept inside the 40-character limit. */
export function suggestHandle(handle: string): string {
  return `${handle.slice(0, 38).replace(/-+$/g, '')}hq`
}
