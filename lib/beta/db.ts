// Beta Command Center: the service-role handle for the beta_* tables.
//
// The generated lib/database.types.ts does NOT yet know the beta_* tables (and
// the new campaigns approval columns) — types: regen after the migration is
// applied (ADR-246). Until then every beta read/write reaches the tables through
// this ONE loose handle: a permissive builder that mirrors the slice of the
// PostgREST fluent surface these modules use. Casting through `unknown` is the
// repo idiom (see lib/importer/materialize.ts, lib/crm/client-notes.ts). Keep
// the surface minimal so a typo still fails the build.
//
// Server-only. Service-role bypasses RLS; every caller gates in app code first
// (reads via the /admin/beta layout, writes via the guards in lib/beta/guard.ts).

import { createAdminClient } from '@/lib/supabase/admin'

type Row = Record<string, unknown>
type Res<T> = { data: T; error: unknown }

export interface SelectChain extends PromiseLike<Res<Row[] | null>> {
  eq(col: string, val: unknown): SelectChain
  neq(col: string, val: unknown): SelectChain
  in(col: string, vals: readonly unknown[]): SelectChain
  is(col: string, val: unknown): SelectChain
  order(col: string, opts?: { ascending?: boolean }): SelectChain
  limit(n: number): SelectChain
  maybeSingle(): Promise<Res<Row | null>>
}

export interface InsertChain extends PromiseLike<Res<Row[] | null>> {
  select(cols?: string): { maybeSingle(): Promise<Res<{ id?: string } | null>> }
}

export interface WriteChain extends PromiseLike<Res<null>> {
  eq(col: string, val: unknown): WriteChain
  in(col: string, vals: readonly unknown[]): WriteChain
}

export interface BetaTable {
  select(cols?: string): SelectChain
  insert(rows: Row | Row[]): InsertChain
  update(vals: Row): WriteChain
  delete(): WriteChain
}

/** The loose service-role handle for the beta_* tables (+ campaigns). */
export function betaDb(): { from(table: string): BetaTable } {
  return createAdminClient() as unknown as { from(table: string): BetaTable }
}
