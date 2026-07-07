// CROSS-TENANT CONTRACT HARNESS (SEC-02). The reusable kit the per-module leak tests compose to
// prove that every space-scoped read / write BINDS THE QUERY TO `space_id` (or a column that
// transitively binds to one Space, e.g. an id that is itself space-scoped). A space-scoped reader
// in this codebase goes through the service-role admin client (createAdminClient), which BYPASSES
// RLS - so the ONLY thing standing between Space A's caller and Space B's rows is the filter the
// reader itself applies. These contracts lock that filter so a refactor that drops it fails CI.
//
// Two complementary modes, both network-free:
//   1. FILTER-PRESENCE (expectSpaceScoped / recorder): mock the admin client with the chainable
//      recorder, run the reader, and assert the EXACT `.eq('space_id', ...)` (or documented binding)
//      was recorded on the Supabase builder. This catches a dropped filter even when the seeded
//      data would happen to be single-tenant.
//   2. TWO-SPACE LEAK (makeTwoSpaceDb): mock the admin client with an in-memory store holding BOTH
//      Space A's and Space B's rows; the filter the reader applies is honored by the fake, so a
//      reader that forgets the filter would visibly return B's rows. The test asserts a Space A
//      caller gets ONLY A's rows. This proves isolation behaviorally, not just structurally.
//
// Built on test/authz/supabase-recorder.ts (the ADR-275 recorder) so there is one query-builder fake
// in the repo, not two.

import { expect } from 'vitest'
import { makeSupabaseRecorder, recorded, type SupabaseRecorder } from '../authz/supabase-recorder'

export { makeSupabaseRecorder, recorded, type SupabaseRecorder }

/** The id the contracts use for "the Space the caller is acting for" (Space A). */
export const SPACE_A = 'space-A'
/** The id of the OTHER Space whose rows must never leak to a Space A caller (Space B). */
export const SPACE_B = 'space-B'

/**
 * Assert a recorded query bound itself to a single Space. By default this is the canonical
 * `.eq('space_id', spaceId)` filter; pass `{ column }` for a reader that binds through a different
 * scoping column (e.g. a join filter `network_contacts.space_id`, or a primary-key `id` on the
 * `spaces` table itself - the row IS the Space, so `.eq('id', spaceId)` is the correct binding).
 *
 * Fails with a precise message naming the missing filter, so a regression reads as a leak, not a
 * generic assertion failure.
 */
export function expectSpaceScoped(
  rec: SupabaseRecorder,
  spaceId: string,
  opts: { column?: string } = {},
): void {
  const column = opts.column ?? 'space_id'
  const ok = recorded(rec, 'eq', column, spaceId)
  expect(
    ok,
    `CROSS-TENANT LEAK: the query never bound .eq('${column}', '${spaceId}'). ` +
      `A service-role (RLS-bypassing) reader MUST filter the Space, or a Space A caller can read ` +
      `another Space's rows. Recorded calls: ${JSON.stringify(rec.calls)}`,
  ).toBe(true)
}

/** Assert a recorded mutation (update / delete / upsert) ALSO bound the Space, so a write can never
 *  cross the tenant boundary. `method` is the terminal mutation verb recorded on the builder. */
export function expectScopedMutation(
  rec: SupabaseRecorder,
  method: 'update' | 'delete' | 'upsert',
  spaceId: string,
  opts: { column?: string } = {},
): void {
  expect(
    recorded(rec, method),
    `expected a .${method}() on the query, recorded: ${JSON.stringify(rec.calls)}`,
  ).toBe(true)
  // An upsert carries the Space in its PAYLOAD, not an `.eq`; assert the payload stamps space_id.
  if (method === 'upsert') {
    const call = rec.calls.find((c) => c.method === 'upsert')
    const payload = call?.args[0] as Record<string, unknown> | undefined
    expect(
      payload?.[opts.column ?? 'space_id'],
      `CROSS-TENANT LEAK: the upsert payload did not stamp the Space (${opts.column ?? 'space_id'}). ` +
        `Recorded: ${JSON.stringify(rec.calls)}`,
    ).toBe(spaceId)
    return
  }
  expectSpaceScoped(rec, spaceId, opts)
}

/** A row in a two-space in-memory table. Every row carries the Space it belongs to. */
export interface ScopedRow {
  space_id: string
  [k: string]: unknown
}

/**
 * A two-space in-memory admin-client fake. Seed it with rows for BOTH Space A and Space B across one
 * or more tables; the fake HONORS the `.eq('space_id', ...)` / `.eq(col, ...)` filters the reader
 * applies, so:
 *   - a reader that correctly filters space_id sees ONLY the matching Space's rows, and
 *   - a reader that DROPS the filter would (visibly) return both Spaces' rows, failing the leak test.
 *
 * Supports the read chain the space-scoped readers use: from(t).select(cols).eq(col,val)[.eq...]
 * .order().limit().maybeSingle().in(col, vals) and awaiting the builder. `.in('x', [])` returns NO
 * rows (mirrors the readers' explicit empty-set guard, never "all rows").
 *
 * This is intentionally small: it is a LEAK ORACLE, not a Postgres. It returns whatever survives the
 * recorded filters so the test can assert "only Space A's rows came back".
 */
export function makeTwoSpaceDb(tables: Record<string, ScopedRow[]>): {
  from: (table: string) => unknown
} {
  function builder(table: string) {
    const rows = tables[table] ?? []
    // The predicate stack the chain accumulates; every terminal applies all of them.
    const preds: ((r: ScopedRow) => boolean)[] = []
    const apply = () => rows.filter((r) => preds.every((p) => p(r)))

    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      not: () => chain,
      // upsert/insert/update/delete record nothing in this in-memory oracle (it exists to prove which
      // ROWS survive the read filters, not to mutate); they return the chain so a `.select().maybeSingle()`
      // after a write resolves to null (no row), matching a real not-returned write.
      upsert: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      neq: (col: string, val: unknown) => {
        preds.push((r) => r[col] !== val)
        return chain
      },
      eq: (col: string, val: unknown) => {
        preds.push((r) => r[col] === val)
        return chain
      },
      in: (col: string, vals: unknown[]) => {
        // An empty `.in([])` matches NOTHING (the readers' guard against a "no filter" leak).
        preds.push((r) => Array.isArray(vals) && vals.includes(r[col]))
        return chain
      },
      maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
      // Make the builder awaitable -> the filtered rows.
      then: (resolve: (v: { data: ScopedRow[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: apply(), error: null })),
    }
    return chain
  }
  return { from: (table: string) => builder(table) }
}
