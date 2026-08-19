// OUTBOUND: the one loose service-role handle the approval spine reads and writes through.
//
// The spine addresses its tables by a VARIABLE name — `TABLE[ref.type]` in
// approvals.ts, which is how a second approvable object type joins the spine by
// adding one row to that map rather than a second query path. A generated
// `Database` type keys `from()` on a string LITERAL, so a dynamic table name
// cannot typecheck against the typed client no matter how complete the generated
// types are (they do now cover `campaigns.approval_status` and `beta_audit_log`).
// So the spine reaches its tables through this ONE permissive builder: a hand-written
// mirror of the slice of the PostgREST fluent surface these modules actually use.
// Casting through `unknown` is the repo idiom (see lib/importer/materialize.ts,
// lib/crm/client-notes.ts). Keep the surface minimal so a typo still fails the build.
//
// Server-only. Service-role bypasses RLS, so every caller gates in app code FIRST:
// reads behind the surface's own requireAdmin, writes behind the approver/writer
// gates in lib/outbound/guard.ts.

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

export interface OutboundTable {
  select(cols?: string): SelectChain
  insert(rows: Row | Row[]): InsertChain
  update(vals: Row): WriteChain
  delete(): WriteChain
}

/** The loose service-role handle for the approval spine's tables (campaigns + beta_audit_log). */
export function outboundDb(): { from(table: string): OutboundTable } {
  return createAdminClient() as unknown as { from(table: string): OutboundTable }
}
