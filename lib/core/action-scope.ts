// THE ACTION SCOPE (LIVE-734): a per-request memo for the one place React `cache()` does not reach.
//
// WHY. `cache()` memoises within a server RENDER. Inside a Server Action it is a pass-through:
// react-server-dom's `getCacheForType` returns a fresh Map when no Flight render is active, and
// Next's action handler (`executeActionAndPrepareForRender` in next/dist/server/app-render/
// action-handler.js) runs the action outside one. So an action that calls several gated getters
// (the entity rail bundle, ADR-1685) resolved the viewer once PER GETTER: one `auth.getUser()`
// (a network call to Supabase Auth), the viewer's profiles row, the stewardship edges and the crew
// grant, again and again, plus the same capability rows for the same entity.
//
// WHAT. `runInActionScope(fn)` opens a scope for the async call tree of `fn`. A function wrapped in
// `actionScoped` is called ONCE per scope per argument list; every later caller in the scope,
// including a concurrent one, shares the first call's result (the promise itself is memoised, so
// parallel getters wait on one in-flight read rather than racing to start their own). Outside a
// scope the wrapper is a plain call, so a page render keeps `cache()` exactly as before and every
// existing caller behaves as it did.
//
// WHY IT IS SAFE TO SHARE. The scope is an AsyncLocalStorage store created per `runInActionScope`
// call, so it holds one request's reads and is invisible to every other request, including a
// concurrent one on the same instance. Nothing in it comes from the client: the viewer is still the
// one Supabase verified against THIS request's cookie, and each getter still runs its own gate
// against it. Open a scope only around READS. A write inside a scope would be followed by reads that
// see the memo from before it.
//
// Dependency-free on purpose (node:async_hooks only), so the LIVE-734 probe can load it in-process.

import { AsyncLocalStorage } from 'node:async_hooks'

type ScopeStore = Map<unknown, Map<string, unknown>>

const storage = new AsyncLocalStorage<ScopeStore>()

/** Run `fn` inside one action scope. A nested call joins the scope it is already in (still one
 *  request), so wrapping twice never splits a memo. */
export function runInActionScope<T>(fn: () => Promise<T>): Promise<T> {
  if (storage.getStore()) return fn()
  return storage.run(new Map(), fn)
}

/** True while running inside an action scope. */
export function inActionScope(): boolean {
  return storage.getStore() !== undefined
}

/** The memo key for one argument list. The wrapped functions take ids, flags and small option
 *  bags, so JSON is exact for them (`undefined` and `null` share a key, and every wrapped function
 *  treats the two alike). */
function keyOf(args: readonly unknown[]): string {
  return JSON.stringify(args)
}

/** Wrap `fn` so it runs once per action scope per argument list, and as a plain call outside one.
 *  The first call's return value (for an async function, its promise, rejection included, which is
 *  what `cache()` does too) is what every later caller in the scope receives. */
export function actionScoped<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const scoped = (...args: A): R => {
    const scope = storage.getStore()
    if (!scope) return fn(...args)
    let memo = scope.get(scoped)
    if (!memo) {
      memo = new Map()
      scope.set(scoped, memo)
    }
    const key = keyOf(args)
    if (memo.has(key)) return memo.get(key) as R
    const value = fn(...args)
    memo.set(key, value)
    return value
  }
  return scoped
}
