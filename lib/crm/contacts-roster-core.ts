// THE CONTACTS ROSTER — the row model and the pure filter / sort / page core, with no VALUE imports
// (LIVE-037).
//
// WHY THIS FILE EXISTS. All of this lived in `lib/crm/contacts-roster.ts`, whose reader opens the
// service-role admin client (`createAdminClient` -> @supabase/supabase-js -> a crypto-browserify
// polyfill graph) and pulls in lib/crm/person, lib/crm/classification, lib/crm/relationships and
// lib/crm/upgrade-signal behind it. `app/(main)/admin/crm/contacts/contacts-roster-client.tsx` is
// `'use client'` and imports `applyContactQuery` plus three types from it — the island is a thin
// shell over exactly this core — so that whole server graph was in the contacts roster's browser
// bundle, and `import 'server-only'` could not be added to `lib/crm/contacts-roster.ts` without
// failing the build.
//
// Same shape of fix, same reasoning, as `lib/journeys/meeting.ts` and `lib/pillars/slugs.ts`
// (ADR-1074). The functions below were already documented as "PURE" and already unit-tested on
// their own; they were parked in a file whose other exports reach the database, and a bundler
// follows modules, not intentions.
//
// ⚠️ KEEP THIS FILE FREE OF VALUE IMPORTS. The three `import type`s below are erased at compile
// time and reach nothing at runtime; a plain `import` here re-opens the door this file was written
// to close. `lib/crm/contacts-roster.ts` re-exports every name below, so every existing server
// caller is unchanged; CLIENT code must import from here.
//
// Naming + voice: every label here is plain, sentence case, no em dashes (docs/NAMING.md,
// docs/CONTENT-VOICE.md).

import type { ContactStatus } from '@/lib/crm/classification'
import type { RelationshipKind } from '@/lib/crm/relationship-kinds'
import type { Facet } from '@/lib/people/member-viewer'

// ── The row model ───────────────────────────────────────────────────────────────────────────────

/** One Space a contact owns (id + name), for the Space facet + the row's meta line. */
export interface RosterSpace {
  id: string
  name: string
}

/** One row in the contacts roster: the presentation-neutral, classifier-backed contact. */
export interface ContactRosterRow {
  contactId: string
  displayName: string
  email: string
  /** The member's handle, for the profile link; null for a subscriber / lead (no profile). */
  handle: string | null
  profileId: string | null
  avatarUrl: string | null
  /** The primary derived status: member > subscriber > lead. */
  status: ContactStatus
  /** The community trust rung (member/host/guide/mentor/…), null for a non-member. */
  communityRole: string | null
  isBusiness: boolean
  activeThisWeek: boolean
  spacesOwned: number
  spaces: RosterSpace[]
  relationshipKinds: RelationshipKind[]
  /** R5: the upgrade-to-business read (score + candidate flag + the "why"). */
  upgradeScore: number
  upgradeCandidate: boolean
  upgradeReasons: string[]
  createdAt: string | null
  // ── Facet + sort fuel (the pure core reads ONLY these two) ──
  /** Facet-matchable tokens (namespaced so they never collide): `status:` / `role:` / `active:` /
   *  `business:` / `space:` / `kind:` / `upgrade:`. The facet filter tests membership here. */
  badges: string[]
  /** Pre-computed sort signals: `joined` epoch, `statusRank`, `active`, `spaces`, `upgrade`. */
  sortValues: Record<string, number | string>
}

/** The roster payload the page hands the client island: the rows, the derived facets, and the
 *  headline counts for the StatCard row. */
export interface ContactsRoster {
  rows: ContactRosterRow[]
  facets: Facet[]
  stats: {
    total: number
    members: number
    subscribers: number
    leads: number
    businesses: number
    upgradeCandidates: number
  }
}

/** The sort options the roster offers (each reads a row's `sortValues` / own field). Plain labels. */
export const CONTACT_SORT_OPTIONS = [
  { key: 'recent', label: 'Recent', spec: { key: 'joined', direction: 'desc' as const } },
  { key: 'name', label: 'Name', spec: { key: 'name', direction: 'asc' as const } },
  { key: 'status', label: 'Status', spec: { key: 'statusRank', direction: 'asc' as const } },
  { key: 'active-now', label: 'Active now', spec: { key: 'active', direction: 'desc' as const } },
  { key: 'spaces', label: 'Most Spaces', spec: { key: 'spaces', direction: 'desc' as const } },
  { key: 'upgrade', label: 'Upgrade score', spec: { key: 'upgrade', direction: 'desc' as const } },
]

// ── The PURE filter / sort / page core (the client island runs this; unit-tested) ────────────────

/** A sort directive: a row field key + direction. */
export interface ContactSort {
  key: string
  direction: 'asc' | 'desc'
}

/** The live query the roster applies. */
export interface ContactQuery {
  /** Free text; matches name + email + handle, case-insensitive. Blank matches everything. */
  text?: string
  /** facetKey -> selected value (empty / absent = no filter for that facet). */
  facets?: Record<string, string>
  sort?: ContactSort
}

/** Does a row match the free-text needle (name + email + handle)? A blank needle matches all. Pure. */
export function contactMatchesText(row: ContactRosterRow, text: string | undefined): boolean {
  const needle = (text ?? '').trim().toLowerCase()
  if (!needle) return true
  const hay = [row.displayName, row.email, row.handle ?? ''].join(' ').toLowerCase()
  return hay.includes(needle)
}

/** Does a row pass every selected facet? An empty selection imposes no filter; a selected value must
 *  appear in the row's `badges`. Pure — works for ANY facet key without per-facet code. */
export function contactMatchesFacets(
  row: ContactRosterRow,
  facets: Record<string, string> | undefined,
): boolean {
  if (!facets) return true
  for (const value of Object.values(facets)) {
    if (!value) continue
    if (!row.badges.includes(value)) return false
  }
  return true
}

/** The value a row offers for a sort key: `name` reads displayName; else `sortValues` (number or
 *  lowercased string). Missing sorts last under asc. Pure. */
function contactSortValue(row: ContactRosterRow, key: string): number | string {
  if (key === 'name') return row.displayName.toLowerCase()
  const pre = row.sortValues[key]
  if (pre != null) return typeof pre === 'number' ? pre : pre.toLowerCase()
  return ''
}

/** Sort a COPY of the rows by the directive (stable; ties keep input order). No directive = input
 *  order. Pure. */
export function sortContacts(rows: ContactRosterRow[], sort: ContactSort | undefined): ContactRosterRow[] {
  if (!sort) return rows.slice()
  const dir = sort.direction === 'desc' ? -1 : 1
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const va = contactSortValue(a.r, sort.key)
      const vb = contactSortValue(b.r, sort.key)
      let cmp: number
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
      else cmp = String(va).localeCompare(String(vb))
      if (cmp !== 0) return cmp * dir
      return a.i - b.i
    })
    .map((x) => x.r)
}

export interface ContactApplyResult {
  visible: ContactRosterRow[]
  total: number
  hasMore: boolean
}

/** Filter (text + facets), sort, then page/cap. `page` is 1-based; `pageSize` clamps to >= 1. Pure +
 *  deterministic, so the client island stays a thin shell over it. */
export function applyContactQuery(
  rows: ContactRosterRow[],
  query: ContactQuery,
  page: number,
  pageSize: number,
): ContactApplyResult {
  const filtered = sortContacts(
    (rows ?? []).filter((r) => contactMatchesText(r, query.text) && contactMatchesFacets(r, query.facets)),
    query.sort,
  )
  const size = Math.max(1, Math.floor(pageSize) || 1)
  const safePage = Math.max(1, Math.floor(page) || 1)
  const visible = filtered.slice(0, safePage * size)
  return { visible, total: filtered.length, hasMore: filtered.length > visible.length }
}
