// The /network Community directory as a SERVER-FILTERED, PAGED read (LIVE-661, ADR-1655).
//
// WHY THIS EXISTS. The directory used to read one capped slice of `profiles` (the first 500 by
// name) and run every filter, the name search included, over that slice in the page. A member
// whose name sorted past the cap could not be found at all: not by browsing, not by searching
// their own name, not by any facet. This module moves each filter into the query and pages with a
// range, so what the directory can show is the whole listable community, one page at a time.
//
// Framework-free (no Next, no Supabase client) so the probe and the suite run the real rules. The
// query builder is typed structurally; app/(main)/network/page.tsx hands it the service-role
// builder and owns the reads.
//
// ── THE LISTING GATE mirrors lib/connections/directory-visibility.ts `isListableInDirectory` ──
// `directory_visible` and `ghost_mode` are NOT NULL columns, so the predicate's "null means the
// column default" branch cannot arise in SQL and the two equalities below are the whole rule. The
// page still passes every row it gets back through the TS predicate, so the SQL and the module
// must both drift before a hidden member could render.

import { ONLINE_MS } from '@/lib/presence'
import { sanitizeOrTerm } from '@/lib/search-sanitize'
import { ROLE_HIERARCHY } from '@/lib/core/roles'

/** Cards per directory page. The old render slice (48) became the page size: the scroll cost it
 *  bounded on low-end phones is unchanged, and now the rest is a page away instead of unreachable. */
export const DIRECTORY_PAGE_SIZE = 48

/** `?page=` from the URL: a positive integer, else 1. Garbage never reaches `.range()`. */
export function parseDirectoryPage(raw: string | undefined | null): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1
}

/** Is `role` a real community_role rung? The column is a Postgres enum, so an unknown value from
 *  the URL would error the read instead of matching nothing. */
export function isDirectoryRole(role: string | undefined | null): boolean {
  return !!role && (ROLE_HIERARCHY as readonly string[]).includes(role)
}

/** The filters one listing read applies, already resolved from the URL. */
export type DirectoryScope = {
  /** Demo content is hidden (global demo mode off, or the viewer turned beta content off). */
  hideDemo?: boolean
  /** Nexus region ids resolved from the `region` name. */
  regionIds?: readonly string[] | null
  /** Only these profile ids (the Circle / City membership resolution, or the nearby lead). */
  onlyIds?: readonly string[] | null
  /** Never these profile ids (the nearby lead, already shown ahead of the alphabetical pages). */
  excludeIds?: readonly string[] | null
  online?: boolean
  topic?: string | null
  role?: string | null
  q?: string | null
  /** Clock for the online cutoff; defaults to now. */
  now?: number
}

/** The subset of a PostgREST filter builder this module calls. Method syntax on purpose: the real
 *  builder's column-typed generics are assignable to it, and each call returns the same builder. */
export interface DirectoryQuery<Q> {
  eq(column: string, value: unknown): Q
  in(column: string, values: readonly unknown[]): Q
  gte(column: string, value: unknown): Q
  contains(column: string, value: unknown): Q
  or(filters: string): Q
  not(column: string, operator: string, value: unknown): Q
}

/** Apply the listing gate and every directory filter to `q`, server-side. */
export function scopeDirectoryQuery<Q extends DirectoryQuery<Q>>(q: Q, scope: DirectoryScope): Q {
  // The listing gate: active, "Show me in the Community directory" on, not ghosting.
  let out = q.eq('is_active', true).eq('directory_visible', true).eq('ghost_mode', false)
  if (scope.hideDemo) out = out.eq('is_demo', false)
  if (scope.regionIds) out = out.in('nexus_region_id', scope.regionIds)
  if (scope.onlyIds) out = out.in('id', scope.onlyIds)
  if (scope.excludeIds && scope.excludeIds.length > 0) {
    out = out.not('id', 'in', `(${scope.excludeIds.join(',')})`)
  }
  if (scope.online) {
    out = out.gte('last_seen_at', new Date((scope.now ?? Date.now()) - ONLINE_MS).toISOString())
  }
  // Sent as a quoted array literal: a tag with a comma or a brace from the URL stays one element.
  if (scope.topic) out = out.contains('entity_types', `{"${scope.topic.replace(/["\\]/g, '\\$&')}"}`)
  if (scope.role) {
    // A profile with no rung reads as a member everywhere on this page, so the Member facet
    // matches the nulls too.
    out = scope.role === 'member'
      ? out.or('community_role.is.null,community_role.eq.member')
      : out.eq('community_role', scope.role)
  }
  const term = scope.q ? sanitizeOrTerm(scope.q) : ''
  if (term) out = out.or(`display_name.ilike.%${term}%,handle.ilike.%${term}%`)
  return out
}

/** Would this scope match nothing without asking? An empty id or region set is an answer, not a
 *  query (and `in.()` is not one to send), and so is a role that is not a rung. */
export function scopeIsEmpty(scope: DirectoryScope): boolean {
  return (scope.onlyIds != null && scope.onlyIds.length === 0) ||
    (scope.regionIds != null && scope.regionIds.length === 0) ||
    (!!scope.role && !isDirectoryRole(scope.role))
}

/** Where one page lands when a `lead` of nearby members goes first and the alphabetical rest
 *  follows. `lead` is a [start, end) slice of the lead list; `rest` is the inclusive `.range()` of
 *  the alphabetical read. Either is null when the page holds none of it. */
export function directoryWindow(
  page: number,
  pageSize: number,
  leadCount: number,
): { lead: [number, number] | null; rest: { from: number; to: number } | null } {
  const start = (page - 1) * pageSize
  const end = start + pageSize
  const leadStart = Math.min(start, leadCount)
  const leadEnd = Math.min(end, leadCount)
  const from = Math.max(0, start - leadCount)
  const to = end - leadCount - 1
  return {
    lead: leadEnd > leadStart ? [leadStart, leadEnd] : null,
    rest: to >= from ? { from, to } : null,
  }
}

/** Pages needed for `total` members (at least 1, so an empty directory is "page 1 of 1"). */
export function directoryPageCount(total: number, pageSize: number = DIRECTORY_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize))
}
