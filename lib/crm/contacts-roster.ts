// THE CONTACTS ROSTER — the read model behind the CRM "Contacts" tab (Resonance CRM · ADR-625).
// One classified list of EVERY contact the platform knows: members, subscribers, and imported leads,
// each carrying the classifier's verdict (status / community role / business standing / activity /
// Spaces owned / relationship kinds) plus the R5 upgrade signal. The surface is a browse Index, so
// this module owns (a) the batched, N+1-free READER, (b) the registry-driven FACETS, and (c) the PURE
// filter / sort / page core the client island runs. Naming + voice: every label here is plain,
// sentence case, no em dashes (docs/NAMING.md, docs/CONTENT-VOICE.md).
//
// NO N+1: the reader makes a FIXED number of set-based reads for the WHOLE cohort, never one-per-row:
//   1. searchContacts        — one read: the capped, most-recent contacts (members + subscribers + leads).
//   2. classifyContacts      — the classifier's batch path (a fixed set of `.in()` reads for the set).
//   3. profiles              — one `.in()` read: handle / avatar / display name for the member profiles.
//   4. spaces                — one `.in()` read: the Spaces those members own (names, for the Space facet).
//   5. scoreUpgradeCandidates — one `.in()` read: the engagement traits for the R5 upgrade blend.
// Everything else is in-memory joins. FAIL-SAFE throughout: a miss degrades to a sensible default.

import { createAdminClient } from '@/lib/supabase/admin'
import { searchContacts } from '@/lib/crm/person'
import { classifyContacts, type ContactStatus } from '@/lib/crm/classification'
import {
  RELATIONSHIP_KINDS,
  relationshipLabel,
  type RelationshipKind,
} from '@/lib/crm/relationships'
import { scoreUpgradeCandidates } from '@/lib/crm/upgrade-signal'
import { ROLE_LABEL } from '@/lib/community-roles'
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

// ── The status rank (for the "Status" sort: member first, lead last) ──
const STATUS_RANK: Record<ContactStatus, number> = { member: 0, subscriber: 1, lead: 2 }

/** The community rungs the role facet offers (the trust ladder; operational web rungs excluded). */
const ROLE_FACET_KEYS: readonly (keyof typeof ROLE_LABEL)[] = ['member', 'crew', 'host', 'guide', 'mentor']

// ── The reader (staff-gated at the call site) ────────────────────────────────────────────────────

/**
 * Load the classified contacts roster: every contact (capped, most-recent first), each with the
 * classifier verdict + the R5 upgrade signal, plus the registry-driven facets + headline counts.
 * Set-based reads only (no N+1). FAIL-SAFE: any miss degrades to a sensible default; a total wipe
 * returns an empty roster (the page shows its calm empty state). The caller gates the read.
 */
export async function loadContactsRoster(opts: { limit?: number } = {}): Promise<ContactsRoster> {
  const limit = Math.max(1, Math.min(1000, opts.limit ?? 500))

  // 1. The capped contacts (members + subscribers + leads), most-recent first.
  const contacts = await searchContacts('', limit)
  if (contacts.length === 0) return emptyRoster()

  const contactIds = contacts.map((c) => c.id)
  const memberProfileIds = [
    ...new Set(contacts.map((c) => c.profileId).filter((p): p is string => !!p)),
  ]

  // 2-4. The classifier verdict (batched), the member profiles (handle/avatar), and the Spaces they
  // own (names) — all set-based, run in parallel.
  const [classifications, profileById, spacesByOwner] = await Promise.all([
    classifyContacts(contactIds),
    loadProfiles(memberProfileIds),
    loadOwnedSpaces(memberProfileIds),
  ])

  // 5. The R5 upgrade blend, over the classified members only (a lead / subscriber cannot upgrade).
  const cohort = memberProfileIds
    .map((pid) => {
      // Find the classification for this member via any of their contact rows.
      const contact = contacts.find((c) => c.profileId === pid)
      const cls = contact ? classifications.get(contact.id) : undefined
      return cls
        ? { profileId: pid, isBusiness: cls.isBusiness, communityRole: cls.communityRole, spacesOwned: cls.spacesOwned }
        : null
    })
    .filter((e): e is NonNullable<typeof e> => !!e)
  const upgradeByProfile = await scoreUpgradeCandidates(cohort)

  const rows: ContactRosterRow[] = contacts.map((c) => {
    const cls = classifications.get(c.id)
    const status: ContactStatus = cls?.status ?? 'lead'
    const communityRole = cls?.communityRole ?? null
    const isBusiness = cls?.isBusiness ?? false
    const activeThisWeek = cls?.isActive ?? false
    const spacesOwned = cls?.spacesOwned ?? 0
    const relationshipKinds = cls?.relationshipKinds ?? []
    const profile = c.profileId ? profileById.get(c.profileId) : undefined
    const spaces = (c.profileId ? spacesByOwner.get(c.profileId) : undefined) ?? []
    const upgrade = c.profileId ? upgradeByProfile.get(c.profileId) : undefined
    const upgradeScore = upgrade?.score ?? 0
    const upgradeCandidate = upgrade?.isCandidate ?? false
    const joined = c.createdAt ? Date.parse(c.createdAt) : NaN

    // Facet tokens: namespaced so a status value can never match a role or a Space value.
    const badges: string[] = [
      `status:${status}`,
      isBusiness ? 'business:yes' : 'business:no',
      activeThisWeek ? 'active:yes' : 'active:no',
    ]
    if (communityRole && (ROLE_FACET_KEYS as readonly string[]).includes(communityRole)) {
      badges.push(`role:${communityRole}`)
    }
    for (const s of spaces) badges.push(`space:${s.id}`)
    for (const k of relationshipKinds) badges.push(`kind:${k}`)
    if (upgradeCandidate) badges.push('upgrade:yes')

    return {
      contactId: c.id,
      displayName: c.displayName?.trim() || c.email.split('@')[0] || 'Unnamed contact',
      email: c.email,
      handle: profile?.handle ?? null,
      profileId: c.profileId,
      avatarUrl: profile?.avatarUrl ?? null,
      status,
      communityRole,
      isBusiness,
      activeThisWeek,
      spacesOwned,
      spaces,
      relationshipKinds,
      upgradeScore,
      upgradeCandidate,
      upgradeReasons: upgrade?.reasons ?? [],
      createdAt: c.createdAt,
      badges,
      sortValues: {
        joined: Number.isFinite(joined) ? joined : 0,
        statusRank: STATUS_RANK[status],
        active: activeThisWeek ? 1 : 0,
        spaces: spacesOwned,
        upgrade: upgradeScore,
      },
    }
  })

  return {
    rows,
    facets: buildContactFacets(rows),
    stats: {
      total: rows.length,
      members: rows.filter((r) => r.status === 'member').length,
      subscribers: rows.filter((r) => r.status === 'subscriber').length,
      leads: rows.filter((r) => r.status === 'lead').length,
      businesses: rows.filter((r) => r.isBusiness).length,
      upgradeCandidates: rows.filter((r) => r.upgradeCandidate).length,
    },
  }
}

function emptyRoster(): ContactsRoster {
  return {
    rows: [],
    facets: [],
    stats: { total: 0, members: 0, subscribers: 0, leads: 0, businesses: 0, upgradeCandidates: 0 },
  }
}

// ── Batched sidecar reads (each one `.in()` for the whole set) ────────────────────────────────────

interface ProfileMini {
  handle: string | null
  avatarUrl: string | null
}

/** Batch-read handle + avatar for a set of member profile ids. One read; fail-safe to an empty map. */
async function loadProfiles(profileIds: string[]): Promise<Map<string, ProfileMini>> {
  const out = new Map<string, ProfileMini>()
  if (profileIds.length === 0) return out
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('id, handle, avatar_url')
      .in('id', profileIds)
    for (const p of (data ?? []) as { id: string; handle: string | null; avatar_url: string | null }[]) {
      out.set(p.id, { handle: p.handle ?? null, avatarUrl: p.avatar_url ?? null })
    }
  } catch {
    /* fall through to the empty map */
  }
  return out
}

/** Batch-read the non-archived Spaces a set of owners run (id + name). One read; fail-safe. */
async function loadOwnedSpaces(profileIds: string[]): Promise<Map<string, RosterSpace[]>> {
  const out = new Map<string, RosterSpace[]>()
  if (profileIds.length === 0) return out
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('spaces')
      .select('id, name, owner_profile_id, status')
      .in('owner_profile_id', profileIds)
    for (const s of (data ?? []) as {
      id: string
      name: string | null
      owner_profile_id: string
      status: string | null
    }[]) {
      if (s.status === 'archived') continue
      const space: RosterSpace = { id: s.id, name: s.name?.trim() || 'Untitled Space' }
      const list = out.get(s.owner_profile_id)
      if (list) list.push(space)
      else out.set(s.owner_profile_id, [space])
    }
  } catch {
    /* fall through to the empty map */
  }
  return out
}

// ── Registry-driven facets (the extensibility seam) ──────────────────────────────────────────────
// Every facet's OPTIONS come from a REGISTRY or the CLASSIFIER, never a hand-listed per-kind array —
// so a new relationship kind added to RELATIONSHIP_KINDS (or a new Space that shows up in the data)
// becomes a filter automatically, with zero UI code. Only options that can actually match a loaded row
// are offered (an empty facet is dropped), so the control never dead-ends the operator.

/** Build the facet set for a loaded roster. Options are derived from the relationship-kind registry +
 *  the community-role ladder + the Spaces present in the data, and pruned to what the rows can match. */
export function buildContactFacets(rows: ContactRosterRow[]): Facet[] {
  const present = new Set<string>(rows.flatMap((r) => r.badges))
  const keep = (options: { value: string; label: string }[]) => options.filter((o) => present.has(o.value))

  const facets: Facet[] = []

  // Status — from the classifier's derived kinds (member / subscriber / lead), registry-labeled.
  const statusOptions = keep(
    RELATIONSHIP_KINDS.filter(
      (k) => k.category === 'derived' && k.key !== 'business',
    ).map((k) => ({ value: `status:${k.key}`, label: k.label })),
  )
  if (statusOptions.length > 0) facets.push({ key: 'status', label: 'Status', options: statusOptions })

  // Community role — from the trust ladder (canonical ROLE_LABEL).
  const roleOptions = keep(
    ROLE_FACET_KEYS.map((r) => ({ value: `role:${r}`, label: ROLE_LABEL[r] })),
  )
  if (roleOptions.length > 0) facets.push({ key: 'role', label: 'Community role', options: roleOptions })

  // Business — the derived `business` kind (label from the registry so the roster + registry share one voice).
  const businessOptions = keep([
    { value: 'business:yes', label: `Runs a Space` },
    { value: 'business:no', label: 'Not a business' },
  ])
  if (businessOptions.length > 0) {
    facets.push({ key: 'business', label: relationshipLabel('business'), options: businessOptions })
  }

  // Activity — active this week vs quiet (the classifier's activity signal).
  const activityOptions = keep([
    { value: 'active:yes', label: 'Active this week' },
    { value: 'active:no', label: 'Quiet this week' },
  ])
  if (activityOptions.length > 0) facets.push({ key: 'active', label: 'Activity', options: activityOptions })

  // Space — DATA-DRIVEN: one option per distinct Space owned by a contact in the set (name-sorted).
  const spaceByToken = new Map<string, string>()
  for (const r of rows) for (const s of r.spaces) spaceByToken.set(`space:${s.id}`, s.name)
  const spaceOptions = [...spaceByToken.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
  if (spaceOptions.length > 0) facets.push({ key: 'space', label: 'Space', options: spaceOptions })

  // Relationship kind — from the assignable registry, so a NEW kind (e.g. a real donor program) that
  // starts getting rows appears here automatically with no per-kind UI code.
  const kindOptions = keep(
    RELATIONSHIP_KINDS.filter((k) => k.category === 'assignable').map((k) => ({
      value: `kind:${k.key}`,
      label: k.label,
    })),
  )
  if (kindOptions.length > 0) facets.push({ key: 'kind', label: 'Relationship', options: kindOptions })

  // Upgrade — the R5 segment (members ready for a Business Space). Only offered when some row qualifies.
  const upgradeOptions = keep([{ value: 'upgrade:yes', label: 'Ready for Business' }])
  if (upgradeOptions.length > 0) facets.push({ key: 'upgrade', label: 'Upgrade', options: upgradeOptions })

  return facets
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
