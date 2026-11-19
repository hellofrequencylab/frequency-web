// Shared return contract for server actions that report outcomes back to the
// client (as opposed to actions that throw, redirect, or return void).
//
// A successful result carries `data`; a failure carries a human-readable
// `error`. Callers discriminate with the `isError(result)` guard below.
//
// Convention guide for this codebase:
//   - Actions invoked imperatively that need to surface success/failure to the
//     UI return `ActionResult<T>`.
//   - Admin/form mutations that the client wraps in try/catch may `throw` instead.
//   - Actions that `redirect(...)` on completion return nothing.

export type ActionResult<T = void> = { data: T } | { error: string }

export function ok(): ActionResult<void>
export function ok<T>(data: T): ActionResult<T>
export function ok<T>(data?: T): ActionResult<T | void> {
  return { data: data as T }
}

export function fail(error: string): ActionResult<never> {
  return { error }
}

export function isError<T>(result: ActionResult<T>): result is { error: string } {
  return 'error' in result
}

/** The member-safe text for a database or storage error (SCAN-1288). A raw PostgREST or Postgres
 *  message names tables, columns, constraints and policies ("new row violates row-level security
 *  policy for table ..."), so it is logged for us and never shown. The one pass-through is a
 *  RAISE EXCEPTION from our own SQL (code P0001), which is written as a sentence for the person. */
export function safeErrorMessage(
  err: { message?: string | null; code?: string | null } | null | undefined,
  fallback = 'Something went wrong. Try again.',
): string {
  if (!err) return fallback
  if (err.code === 'P0001' && err.message) return err.message
  console.error('[action] error hidden from the member', { code: err.code ?? null, message: err.message ?? null })
  return fallback
}
