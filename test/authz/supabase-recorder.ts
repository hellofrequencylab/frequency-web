// A chainable, awaitable fake of the Supabase query builder for AUTHZ regression tests
// (ADR-275). Every builder method (from/select/eq/update/delete/upsert/in/order/limit/
// maybeSingle/…) records the call and returns the recorder; awaiting it (or any terminal)
// resolves to a configurable `{ data, error }`. This lets a unit test assert that a sensitive
// mutation applied the EXPECTED SCOPING FILTERS (e.g. an event-scoped `.eq('event_id', …)`)
// without a live database — the kind of check that would have caught the confused-deputy
// IDORs fixed in ADR-274.

export interface QueryCall {
  method: string
  args: unknown[]
}

export interface SupabaseRecorder {
  /** Every builder call made through this recorder, in order. */
  calls: QueryCall[]
}

type Result = { data?: unknown; error?: unknown }

/** Build a recorder seeded with the result every terminal/await resolves to. */
export function makeSupabaseRecorder(result: Result = { data: null, error: null }): SupabaseRecorder {
  const calls: QueryCall[] = []
  const resolved = { data: result.data ?? null, error: result.error ?? null }

  const proxy: SupabaseRecorder = new Proxy({ calls } as SupabaseRecorder, {
    get(_target, prop) {
      if (prop === 'calls') return calls
      // Make the builder awaitable: `await query` (and PostgREST builders are thenables)
      // resolves to the seeded result.
      if (prop === 'then') {
        return (onFulfilled: (v: typeof resolved) => unknown) => Promise.resolve(resolved).then(onFulfilled)
      }
      // Any other property is a builder method: record it and keep the chain going.
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args })
        return proxy
      }
    },
  })

  return proxy
}

/** True if the recorded chain applied `.<method>(...args)` (prefix match on args). */
export function recorded(rec: SupabaseRecorder, method: string, ...args: unknown[]): boolean {
  return rec.calls.some((c) => c.method === method && args.every((a, i) => c.args[i] === a))
}
