// Single source of truth for the ACCESS MATRIX — "what function does each role get
// on each SURFACE" (the owner's Roles & Permissions sheet, 2026-06-08). The typed
// encoding of docs/ROLES.md › "The access matrix".
//
// Complementary to capabilities.ts (this directory): that resolver answers per-SCOPE
// fine-grained capabilities ("can I edit THIS circle?", ADR-017). This module answers
// the surface-level question the sheet draws ("how much function does this viewer get
// on the Quest / the Business CRM / the Financial Dashboard?"). The nav/grid reads
// THIS; inline controls read both.
//
// Framework-independent (no Next/Supabase/React) — like lib/core/roles.ts and
// lib/core/staff-roles.ts.
//
// THE UNIFIED-SITE PRINCIPLE (owner directive): the site is identical for everyone —
// same shell, pages and nav. Roles get different *functions and options inside the
// shared surfaces*, never different destinations. So this matrix returns, per surface,
// HOW MUCH FUNCTION a viewer gets — 'none' | 'limited' | 'full' — and the page reveals
// the matching controls. Gating is per-CAPABILITY, not per-route.
//
// Scope (build step P1.1): encodes the COMMUNITY + ENTITLEMENT + PARTNER + top-admin
// world exactly as the sheet drew it. The granular staff departments
// (operations/marketing/accounting/support) keep their per-domain enforcement in
// staff-roles.ts (`staffCan`); only analyst/admin/owner map into this matrix (the only
// staff columns the sheet enumerates). Reconciled fully in P1.4 / P1.6.

import { ROLE_HIERARCHY, roleRank, type CommunityRole } from './roles'
import type { StaffRole } from './staff-roles'

// ── The three things the matrix can say about a (surface × viewer) pair ──────────
export type AccessLevel = 'none' | 'limited' | 'full'

const LEVEL_RANK: Record<AccessLevel, number> = { none: 0, limited: 1, full: 2 }

/** The most-open of two levels (none < limited < full). */
export function maxLevel(a: AccessLevel, b: AccessLevel): AccessLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b
}

// ── New axes the matrix introduces (see docs/ROLES.md). Defined here so the matrix
//    is self-contained until the dedicated tables land (P1.3 / P2 / P3). ──────────
/** Billing entitlement — the membership axis, orthogonal to every role.
 *  Member (free) → Crew (paid) → Supporter. "Everyone is part of the Crew on the paid tier." */
export type EntitlementTier = 'free' | 'crew' | 'supporter'

/** Self-serve partner personas (multi-select hats). */
export type PartnerPersona = 'collaborator' | 'practitioner' | 'business' | 'organization'

// ── The matrix columns: exactly the 13 columns of the owner's sheet ──────────────
export type MatrixColumn =
  | 'visitor' | 'member' | 'crew' // crew = the PAID column (the ✋→✅ entitlement jump)
  | 'host' | 'guide' | 'mentor'
  | 'collaborator' | 'practitioner' | 'business' | 'organization'
  | 'analyst' | 'admin' | 'janitor'

// ── The matrix rows: the surfaces everyone navigates to ──────────────────────────
export type Surface =
  // Community
  | 'feed' | 'broadcast' | 'circles' | 'channels' | 'events' | 'market' | 'people'
  | 'messageBoards'
  // The Quest
  | 'quest' | 'journeys' | 'practices' | 'library' | 'vault'
  // Lead — the network-scoped leader surface (host+ only)
  | 'lead'
  // Studio
  | 'studioOverview' | 'support' | 'personalCrm' | 'businessCrm' | 'website'
  | 'hookNetwork' | 'growthStudio' | 'earnings' | 'qrStudio'
  // Platform
  | 'status' | 'insight' | 'veraAi' | 'platformManage' | 'financialDashboard' | 'settings'

type Row = Partial<Record<MatrixColumn, AccessLevel>> // omitted column ⇒ 'none'

// Shared row shapes (kept DRY — many surfaces share a cell pattern). Mirrors the owner's
// Roles & Permissions sheet (2026-06-08): ⏱️/✋🏼 = limited, ✅ = full, 🚫 = none.
const COMMUNITY_OPEN: Row = { visitor: 'limited', member: 'full' } // browse as visitor, full as member
const QUEST_OPEN: Row = { visitor: 'limited', member: 'full' }
const EVERYONE: Row = { visitor: 'full', member: 'full' } // universal (Status, Settings)

// Every active partner persona — used where the sheet grants all four personas full.
const PARTNERS_FULL = { collaborator: 'full', practitioner: 'full', business: 'full', organization: 'full' } as const
// Free preview → paid unlock (✋→✅), then full for stewards, every partner persona, and
// staff (analyst/admin/janitor). The sheet's Vault / Studio Overview / Support / QR shape.
const PAID_FULL: Row = { member: 'limited', crew: 'full', host: 'full', ...PARTNERS_FULL, analyst: 'full', admin: 'full', janitor: 'full' }

// THE MATRIX. Encodes docs/ROLES.md › "The access matrix". Omitted columns ⇒ 'none'.
// Two deliberate, documented deviations from the literal sheet:
//  • Stewardship is treated as MONOTONIC (a Mentor ≥ a Guide ≥ a Host) via the
//    cumulative ladder in `columnsForHats` — so Insight/Vera-AI "host limited" extends
//    up to guide/mentor. The sheet marked only Host; a senior steward seeing *less* is
//    almost certainly an oversight. Flagged to confirm in ROLES.md.
//  • Only analyst/admin/janitor staff columns exist (the sheet's choice); the other
//    staff departments stay on `staffCan`.
export const ACCESS_MATRIX: Record<Surface, Row> = {
  // ── Community — one site for everyone; visitors preview ─────────────────────────
  feed: COMMUNITY_OPEN,
  broadcast: COMMUNITY_OPEN,
  circles: COMMUNITY_OPEN,
  channels: COMMUNITY_OPEN,
  events: COMMUNITY_OPEN,
  market: COMMUNITY_OPEN,
  people: { member: 'full' }, // visitor 🚫 (sheet)
  messageBoards: { member: 'full' }, // visitor 🚫 — maps to Messages

  // ── The Quest — everyone plays; only the Vault (cash-in) is paid-gated ───────────
  quest: QUEST_OPEN,
  journeys: QUEST_OPEN,
  practices: QUEST_OPEN,
  library: QUEST_OPEN,
  vault: { visitor: 'limited', ...PAID_FULL }, // preview → paid; stewards/partners/staff full

  // ── Lead — the consolidated LEADER dashboard, host+ on the trust ladder only ─────
  // (ADR network-scoped leader surface, /lead). NOT a paid/preview surface and NOT
  // staff-gated by department: a community leader is whoever holds host/guide/mentor.
  // 'full' only for those rungs (cumulative columns) + the platform staff axis; member
  // and visitor get 'none', so the nav item is hidden for them and the page redirects.
  lead: { host: 'full', guide: 'full', mentor: 'full', admin: 'full', janitor: 'full' },

  // ── Studio — stewardship + the partner business block ───────────────────────────
  studioOverview: { visitor: 'limited', ...PAID_FULL }, // everyone previews the Studio; full at crew+
  support: { visitor: 'limited', ...PAID_FULL }, // members submit a request (limited); full console at crew+/staff
  personalCrm: PAID_FULL, // Connections / personal CRM — member preview → paid; partners/staff full
  businessCrm: { practitioner: 'limited', business: 'full', organization: 'full', analyst: 'full', admin: 'full', janitor: 'full' },
  website: { practitioner: 'limited', business: 'full', organization: 'full', admin: 'full', janitor: 'full' }, // analyst 🚫
  hookNetwork: { business: 'limited', organization: 'full', admin: 'full', janitor: 'full' }, // Org product
  growthStudio: { business: 'full', organization: 'full', analyst: 'full', admin: 'full', janitor: 'full' }, // practitioner 🚫 (sheet)
  earnings: { ...PARTNERS_FULL, admin: 'full', janitor: 'full' }, // analyst 🚫 (sheet)
  qrStudio: PAID_FULL, // member preview → paid; partners/staff full

  // ── Platform — operator keys ────────────────────────────────────────────────────
  status: EVERYONE,
  // Insight & Vera: Host gets a LIMITED view (basic circle support); Guide/Mentor get the
  // deeper analytics (owner correction to the sheet — seniors get MORE, not less).
  insight: { host: 'limited', guide: 'full', mentor: 'full', collaborator: 'full', practitioner: 'limited', business: 'full', organization: 'full', analyst: 'full', admin: 'full', janitor: 'full' },
  veraAi: { host: 'limited', guide: 'full', mentor: 'full', practitioner: 'limited', business: 'full', organization: 'full', analyst: 'full', admin: 'full', janitor: 'full' },
  platformManage: { admin: 'full', janitor: 'full' }, // Hubs & Nexuses · Memberships · Pages — admin only
  financialDashboard: { janitor: 'full' }, // Janitor ONLY — Admin is excluded (the financials carve-out)
  settings: EVERYONE,
}

// ── A viewer's hats (the inputs that decide which columns they satisfy) ───────────
export type Hats = {
  /** False / omitted ⇒ logged-out visitor. */
  loggedIn?: boolean
  /** Community stewardship ladder (lib/core/roles). */
  role?: CommunityRole | null
  /** Billing entitlement. A paid tier (member/supporter) unlocks the ✋ "crew" column. */
  tier?: EntitlementTier | null
  /** Active partner personas (multi-select). */
  personas?: PartnerPersona[] | null
  /** Staff/ops role (lib/core/staff-roles). Only analyst/admin/owner map into the matrix. */
  staff?: StaffRole | null
}

/** True when the viewer holds a paid membership — Crew or Supporter (the entitlement unlock). */
export function isPaid(tier: EntitlementTier | null | undefined): boolean {
  return tier === 'crew' || tier === 'supporter'
}

/**
 * Which matrix columns does this viewer satisfy? Access to a surface is the MOST-OPEN
 * level across this set (docs/ROLES.md). Logged-out ⇒ just `visitor`.
 */
export function columnsForHats(h: Hats): Set<MatrixColumn> {
  if (!h.loggedIn) return new Set<MatrixColumn>(['visitor'])

  const cols = new Set<MatrixColumn>(['member']) // logged-in baseline

  // Entitlement → the paid ('crew') column. DECOUPLED from role (§11.2): paid is the
  // billing tier ONLY. The community 'crew' role is pure stewardship — member-level on
  // surfaces; its circle-helper powers live in the per-scope resolver, not here.
  if (isPaid(h.tier)) cols.add('crew')

  // Stewardship ladder — member → host → guide → mentor → admin → janitor. The 'crew'
  // rung is intentionally skipped (it's the paid column above, not a surface tier).
  // Cumulative & monotonic: a Mentor covers Host/Guide; Admin/Janitor reach theirs too.
  const r = roleRank(h.role)
  for (const rung of ROLE_HIERARCHY) {
    if (rung !== 'crew' && roleRank(rung) <= r) cols.add(rung as MatrixColumn)
  }

  // Partner personas — independent hats, each lights its own column.
  for (const p of h.personas ?? []) cols.add(p)

  // Staff axis → only the columns the sheet enumerates (analyst/admin/janitor). Other
  // departments keep per-domain enforcement in staffCan (out of this matrix).
  if (h.staff === 'analyst') cols.add('analyst')
  else if (h.staff === 'admin') cols.add('admin')
  else if (h.staff === 'owner') { cols.add('admin'); cols.add('janitor') }

  return cols
}

/** The access level this viewer has on `surface` — the most-open applicable cell. */
export function accessTo(surface: Surface, h: Hats): AccessLevel {
  const row = ACCESS_MATRIX[surface]
  let level: AccessLevel = 'none'
  for (const col of columnsForHats(h)) {
    const cell = row[col]
    if (cell) level = maxLevel(level, cell)
  }
  return level
}

/** Full function on this surface? */
export function canUse(surface: Surface, h: Hats): boolean {
  return accessTo(surface, h) === 'full'
}

/** Any access at all (limited preview or full)? */
export function canPreview(surface: Surface, h: Hats): boolean {
  return accessTo(surface, h) !== 'none'
}

/** Limited (preview / upgrade-gated) but not yet full — show the upgrade affordance. */
export function isGated(surface: Surface, h: Hats): boolean {
  return accessTo(surface, h) === 'limited'
}
