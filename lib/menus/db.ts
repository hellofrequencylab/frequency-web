// Untyped admin-client handle for the menu tables.
//
// The menu_system tables (migration 20260721000000) are NOT in the generated types
// yet (regenerate lib/database.types.ts after applying the migration, ADR-246
// pattern). Rather than reach for `any`, we model the PostgREST query builder as a
// small self-referential interface: every filter / mutation method returns the same
// builder, and the builder is itself awaitable (it resolves to { data, error }). This
// keeps the reads/writes type-safe at the call site while staying decoupled from the
// generated Database type, mirroring the repo's `as unknown as` casts (lib/library.ts,
// lib/crm/client-notes.ts).

import { createAdminClient } from '@/lib/supabase/admin'

/** The PostgREST result every awaited query resolves to. `data` is the row array a
 *  `.select()` returns (PostgREST returns a list unless `.single()` is used, which
 *  the menu layer never does), or null on error. */
export type MenuQueryResult<Row = Record<string, unknown>> = {
  data: Row[] | null
  error: { message: string } | null
}

/** A chainable, awaitable query builder over the untyped menu tables. Each method
 *  returns the same builder, and the builder is itself awaitable. */
export interface MenuQuery<Row = Record<string, unknown>> extends PromiseLike<MenuQueryResult<Row>> {
  select(cols: string): MenuQuery<Row>
  insert(values: Record<string, unknown> | Record<string, unknown>[]): MenuQuery<Row>
  update(values: Record<string, unknown>): MenuQuery<Row>
  upsert(values: Record<string, unknown>, opts?: { onConflict: string }): MenuQuery<Row>
  delete(): MenuQuery<Row>
  eq(col: string, val: string | number): MenuQuery<Row>
  is(col: string, val: null): MenuQuery<Row>
  in(col: string, vals: (string | number)[]): MenuQuery<Row>
  limit(n: number): MenuQuery<Row>
}

/** An untyped admin client whose `.from()` yields the chainable MenuQuery above. The
 *  row type is supplied per call (e.g. `from<MenuRow>('menus')`). */
export interface MenuDb {
  from<Row = Record<string, unknown>>(table: string): MenuQuery<Row>
}

/** Service-role client cast to the untyped menu-table handle. */
export function menuDb(): MenuDb {
  return createAdminClient() as unknown as MenuDb
}
