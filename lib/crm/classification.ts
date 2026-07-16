// THE CLASSIFIER — the Resonance CRM restructure's read model for "what IS this contact?"
// (ADR-625, docs/DECISIONS.md). A contact is not one column-stored type; their standing is DERIVED
// from the record + a few batched signals: their profile link + consent (member / subscriber /
// lead), whether they operate a Space (business), whether they are active this week, their community
// trust rung, how many Spaces they own, and the SET of assignable relationship kinds they hold.
//
// SHAPE (mirrors lib/crm/engagement-stats.ts): the DERIVATION is a set of PURE helpers (no Supabase/
// Next imports) so every rule is deterministic + unit-tested; the IO wrappers (`classifyMembers`,
// `classifyContacts`) gather the signals through the service-role admin client with SET-BASED reads
// (a fixed number of `.in()` queries for the WHOLE set — never one-per-row) and are FAIL-SAFE (any
// error degrades to a sensible default / empty map, never a throw). The caller is the read authority.
//
// Naming + voice: this module holds no member-facing copy, only logic + stable status keys.

import { createAdminClient } from '@/lib/supabase/admin'
import type { RelationshipKind } from './relationships'
import { isAssignableKind } from './relationships'

// ── The verdict ────────────────────────────────────────────────────────────────

/** The single primary status a contact reads as. Derived, never stored. */
export type ContactStatus = 'member' | 'subscriber' | 'lead'

/** What the classifier decides about one contact. */
export interface ContactClassification {
  /** The primary status: member (has a profile) > subscriber (opted in) > lead (everyone else). */
  status: ContactStatus
  /** The community trust rung from the profile (member/host/guide/mentor/…), null for a non-member. */
  communityRole: string | null
  /** Operates a Space: owns a business-ish Space OR holds a Space admin seat. */
  isBusiness: boolean
  /** Active this week: weekly-active (wam) or a last-active timestamp within the active window. */
  isActive: boolean
  /** How many active Spaces they own. */
  spacesOwned: number
  /** The SET of ASSIGNABLE relationship kinds they hold (donor/partner/…), plus nothing derived. */
  relationshipKinds: RelationshipKind[]
}

/** The fail-safe default (an unknown / unscored lead). */
export const UNCLASSIFIED: ContactClassification = {
  status: 'lead',
  communityRole: null,
  isBusiness: false,
  isActive: false,
  spacesOwned: 0,
  relationshipKinds: [],
}

// ── Pure derivation (unit-tested) ───────────────────────────────────────────────

/** The Space `type` values that count as running a business (drives the derived `business` kind).
 *  'root' is the platform itself and 'lab' is the Labs program (its own relationship kind), so
 *  neither confers business standing; every other operator Space type does. */
export const BUSINESS_SPACE_TYPES: readonly string[] = [
  'practitioner',
  'business',
  'organization',
  'partner',
  'coaching',
]

/** How recently a contact must have been active to count as "active this week" (7 days, ms). */
export const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** The primary status from the profile link + consent. Member if a profile is linked; else
 *  subscriber if they opted in; else lead. Pure. */
export function deriveStatus(input: {
  profileId: string | null | undefined
  consentState: string | null | undefined
}): ContactStatus {
  if (input.profileId) return 'member'
  if (input.consentState === 'subscribed') return 'subscriber'
  return 'lead'
}

/** True when the contact operates a business: owns at least one business-ish Space, OR holds a Space
 *  admin seat. Pure. */
export function deriveIsBusiness(input: {
  ownedBusinessSpaces: number
  isSpaceAdmin: boolean
}): boolean {
  return input.ownedBusinessSpaces > 0 || input.isSpaceAdmin
}

/** True when the contact is active this week: weekly-active (wam_status true) OR a last-active
 *  timestamp inside the active window. Pure; `now` defaults to Date.now(). */
export function deriveIsActive(
  input: { wamStatus: boolean | null | undefined; lastActiveAt: string | null | undefined },
  now: number = Date.now(),
): boolean {
  if (input.wamStatus === true) return true
  if (input.lastActiveAt) {
    const t = Date.parse(input.lastActiveAt)
    if (Number.isFinite(t) && now - t <= ACTIVE_WINDOW_MS) return true
  }
  return false
}

/** Keep only the KNOWN assignable kinds from a raw list, de-duplicated + registry-order stable.
 *  Pure (unknown / derived kinds are dropped). */
export function normalizeRelationshipKinds(kinds: (string | null | undefined)[]): RelationshipKind[] {
  const seen = new Set<RelationshipKind>()
  for (const k of kinds) {
    if (isAssignableKind(k)) seen.add(k)
  }
  return [...seen]
}

/** All the per-contact signals the pure classifier needs (already gathered by the batch IO). */
export interface ClassifyContext {
  communityRole: string | null
  spacesOwned: number
  ownedBusinessSpaces: number
  isSpaceAdmin: boolean
  wamStatus: boolean | null
  lastActiveAt: string | null
  relationshipKinds: (string | null | undefined)[]
  now?: number
}

/** The minimal contact row the classifier reads. */
export interface ClassifyRow {
  profileId: string | null
  consentState: string | null
}

/**
 * Classify ONE contact from its row + the gathered context. PURE + deterministic — the batch IO
 * wrappers below build the context with set-based reads and call this per row. communityRole is
 * only meaningful for a member (a lead/subscriber has no profile), so it is nulled for non-members.
 */
export function classifyContact(row: ClassifyRow, ctx: ClassifyContext): ContactClassification {
  const status = deriveStatus({ profileId: row.profileId, consentState: row.consentState })
  return {
    status,
    communityRole: status === 'member' ? ctx.communityRole : null,
    isBusiness: deriveIsBusiness({
      ownedBusinessSpaces: ctx.ownedBusinessSpaces,
      isSpaceAdmin: ctx.isSpaceAdmin,
    }),
    isActive: deriveIsActive({ wamStatus: ctx.wamStatus, lastActiveAt: ctx.lastActiveAt }, ctx.now),
    spacesOwned: Math.max(0, ctx.spacesOwned),
    relationshipKinds: normalizeRelationshipKinds(ctx.relationshipKinds),
  }
}

// ── Batch IO (set-based reads, no N+1, fail-safe) ────────────────────────────────

/** A gathered per-profile signal bag (owned spaces, admin seat, wam) keyed by profile id. */
interface ProfileSignals {
  communityRole: string | null
  spacesOwned: number
  ownedBusinessSpaces: number
  isSpaceAdmin: boolean
  wamStatus: boolean | null
  lastActiveAt: string | null
}

const EMPTY_SIGNALS: ProfileSignals = {
  communityRole: null,
  spacesOwned: 0,
  ownedBusinessSpaces: 0,
  isSpaceAdmin: false,
  wamStatus: null,
  lastActiveAt: null,
}

/** Settle one read to its rows, or [] on any error (so one failing table never sinks the batch).
 *  Accepts the untyped admin-client result (ADR-246) and casts the rows to the caller's shape. */
async function safeRows<T>(p: PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  try {
    const { data } = await p
    return (data ?? []) as T[]
  } catch {
    return []
  }
}

/**
 * Gather the per-profile signals for a SET of profile ids in a fixed number of BATCHED reads (no
 * N+1): community_role from profiles, owned Spaces from spaces, the admin seat from space_members,
 * and wam/last-active from the engagement matview. Each read is independent + fail-safe.
 */
async function gatherProfileSignals(profileIds: string[]): Promise<Map<string, ProfileSignals>> {
  const out = new Map<string, ProfileSignals>()
  const ids = [...new Set(profileIds.filter(Boolean))]
  if (ids.length === 0) return out
  const admin = createAdminClient()
  const untyped = admin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        in: (col: string, vals: string[]) => PromiseLike<{ data: unknown[] | null }> & {
          eq: (col: string, val: string) => PromiseLike<{ data: unknown[] | null }>
        }
      }
    }
  }

  const [profiles, spaces, admins, scores] = await Promise.all([
    safeRows<{ id: string; community_role: string | null }>(
      untyped.from('profiles').select('id, community_role').in('id', ids),
    ),
    safeRows<{ owner_profile_id: string; type: string | null; status: string | null }>(
      untyped.from('spaces').select('owner_profile_id, type, status').in('owner_profile_id', ids),
    ),
    safeRows<{ profile_id: string }>(
      untyped.from('space_members').select('profile_id').in('profile_id', ids).eq('role', 'admin'),
    ),
    safeRows<{ profile_id: string; wam_status: boolean | null; last_active_at: string | null }>(
      untyped
        .from('member_engagement_scores')
        .select('profile_id, wam_status, last_active_at')
        .in('profile_id', ids),
    ),
  ])

  const ensure = (pid: string): ProfileSignals => {
    let s = out.get(pid)
    if (!s) {
      s = { ...EMPTY_SIGNALS }
      out.set(pid, s)
    }
    return s
  }

  for (const p of profiles) ensure(p.id).communityRole = p.community_role ?? null
  for (const sp of spaces) {
    if (sp.status === 'archived') continue
    const s = ensure(sp.owner_profile_id)
    s.spacesOwned += 1
    if (sp.type && BUSINESS_SPACE_TYPES.includes(sp.type)) s.ownedBusinessSpaces += 1
  }
  for (const a of admins) ensure(a.profile_id).isSpaceAdmin = true
  for (const sc of scores) {
    const s = ensure(sc.profile_id)
    s.wamStatus = sc.wam_status ?? null
    s.lastActiveAt = sc.last_active_at ?? null
  }
  return out
}

/**
 * BATCH-read the assignable relationship kinds for a set of contact ids, keyed by contact id. One
 * query for the set (no N+1). Fail-safe to an empty map; unknown kinds are dropped.
 */
async function gatherRelationshipKinds(contactIds: string[]): Promise<Map<string, RelationshipKind[]>> {
  const out = new Map<string, RelationshipKind[]>()
  const ids = [...new Set(contactIds.filter(Boolean))]
  if (ids.length === 0) return out
  const rows = await safeRows<{ contact_id: string; kind: string }>(
    (createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (col: string, vals: string[]) => {
            eq: (col: string, val: string) => PromiseLike<{ data: { contact_id: string; kind: string }[] | null }>
          }
        }
      }
    })
      .from('contact_relationships')
      .select('contact_id, kind')
      .in('contact_id', ids)
      .eq('status', 'active'),
  )
  for (const r of rows) {
    if (!isAssignableKind(r.kind)) continue
    const list = out.get(r.contact_id)
    if (list) {
      if (!list.includes(r.kind)) list.push(r.kind)
    } else out.set(r.contact_id, [r.kind])
  }
  return out
}

/** A minimal contacts row for the batch classifiers. */
interface ContactRow {
  id: string
  profile_id: string | null
  consent_state: string | null
}

/**
 * The shared engine: given the resolved contact rows, gather every signal in batched reads and
 * classify each. Returns a map keyed by CONTACT id. Fail-safe: an empty input or any gather error
 * yields UNCLASSIFIED entries rather than throwing.
 */
async function classifyContactRows(
  rows: ContactRow[],
  now?: number,
): Promise<Map<string, ContactClassification>> {
  const out = new Map<string, ContactClassification>()
  if (rows.length === 0) return out
  const profileIds = rows.map((r) => r.profile_id).filter((p): p is string => !!p)
  const contactIds = rows.map((r) => r.id)

  const [signals, relByContact] = await Promise.all([
    gatherProfileSignals(profileIds),
    gatherRelationshipKinds(contactIds),
  ])

  for (const row of rows) {
    const sig = (row.profile_id && signals.get(row.profile_id)) || EMPTY_SIGNALS
    out.set(
      row.id,
      classifyContact(
        { profileId: row.profile_id, consentState: row.consent_state },
        {
          communityRole: sig.communityRole,
          spacesOwned: sig.spacesOwned,
          ownedBusinessSpaces: sig.ownedBusinessSpaces,
          isSpaceAdmin: sig.isSpaceAdmin,
          wamStatus: sig.wamStatus,
          lastActiveAt: sig.lastActiveAt,
          relationshipKinds: relByContact.get(row.id) ?? [],
          now,
        },
      ),
    )
  }
  return out
}

/**
 * BATCH classify a set of CONTACTS by contact id. Set-based reads only (no N+1): one contacts read,
 * then a fixed number of batched signal reads shared across the whole set. Returns a map keyed by
 * contact id. FAIL-SAFE to an empty map. The caller (a staff-gated CRM surface) gates the read.
 */
export async function classifyContacts(
  contactIds: string[],
  opts: { now?: number } = {},
): Promise<Map<string, ContactClassification>> {
  const ids = [...new Set(contactIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  try {
    const admin = createAdminClient()
    const rows = await safeRows<ContactRow>(
      admin.from('contacts').select('id, profile_id, consent_state').in('id', ids),
    )
    return classifyContactRows(rows, opts.now)
  } catch {
    return new Map()
  }
}

/**
 * BATCH classify a set of MEMBERS by profile id (the roster's key). Resolves each profile's contact
 * row first (so relationship kinds, which are contact-scoped, come along), then runs the shared
 * engine. Set-based reads only (no N+1). Returns a map keyed by PROFILE id. FAIL-SAFE to an empty
 * map. The caller gates the read.
 */
export async function classifyMembers(
  profileIds: string[],
  opts: { now?: number } = {},
): Promise<Map<string, ContactClassification>> {
  const ids = [...new Set(profileIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  try {
    const admin = createAdminClient()
    // One batched read: the contact row behind each profile (member records are profile-linked).
    const contactRows = await safeRows<ContactRow>(
      admin.from('contacts').select('id, profile_id, consent_state').in('profile_id', ids),
    )
    // Keep the FIRST contact per profile (a member's platform record is their root-space contact).
    const byProfile = new Map<string, ContactRow>()
    for (const r of contactRows) {
      if (r.profile_id && !byProfile.has(r.profile_id)) byProfile.set(r.profile_id, r)
    }
    const byContact = await classifyContactRows([...byProfile.values()], opts.now)

    // Re-key the result by profile id, and fold in profiles with no contact row (still a member).
    const out = new Map<string, ContactClassification>()
    for (const pid of ids) {
      const row = byProfile.get(pid)
      const cls = row ? byContact.get(row.id) : undefined
      out.set(pid, cls ?? { ...UNCLASSIFIED, status: 'member' })
    }
    // A profile with no contact row still deserves its owned-Space / role signals: gather for the
    // stragglers in one more batched read so a contactless member is not mis-derived as inactive.
    const missing = ids.filter((pid) => !byProfile.has(pid))
    if (missing.length > 0) {
      const signals = await gatherProfileSignals(missing)
      for (const pid of missing) {
        const sig = signals.get(pid) ?? EMPTY_SIGNALS
        out.set(
          pid,
          classifyContact(
            { profileId: pid, consentState: null },
            {
              communityRole: sig.communityRole,
              spacesOwned: sig.spacesOwned,
              ownedBusinessSpaces: sig.ownedBusinessSpaces,
              isSpaceAdmin: sig.isSpaceAdmin,
              wamStatus: sig.wamStatus,
              lastActiveAt: sig.lastActiveAt,
              relationshipKinds: [],
              now: opts.now,
            },
          ),
        )
      }
    }
    return out
  } catch {
    return new Map()
  }
}
