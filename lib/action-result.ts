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
