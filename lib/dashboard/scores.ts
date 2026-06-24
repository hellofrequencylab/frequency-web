// The dashboard READ LAYER (Resonance Engine Phase 2 · ADR-383 · docs/NEXT-GEN-CRM.md
// "The brilliant admin dashboard"). The fail-safe reads the three cockpit altitudes share:
// the platform / per-Space health summary (the StatCard row + the lifecycle funnel) and the
// who-needs-attention worklist. Every read goes through the SECURITY DEFINER RPCs over the
// member_engagement_scores matview (lib never raw-scans member_traits), and DEGRADES TO ZEROS
// when the matview / RPC is absent (pre-migration) or errors (ADR-246), so the cockpit shows a
// calm empty state, never a crash.
//
// authz-delegated: this is a READ layer. It performs NO mutation. The read authority lives at
// the CALL SITE: the platform cockpit gates on the staff floor (requireAdmin('janitor'), like
// Phase 1's /admin/crm/today); the Space cockpit gates on the Space CRM entitlement + owner/
// admin before passing a space_id. This module reads through the service-role admin client and
// binds every Space read to the space_id it was handed.

import { createAdminClient } from '@/lib/supabase/admin'
import { buildTodayCards, type TodayCard } from '@/lib/ai/vera/today'
import type { ResonanceTier } from '@/lib/traits/compute'

// ── Types ───────────────────────────────────────────────────────────────────

/** The platform (or Space) health summary: the StatCard row's numbers, fail-safe to zeros. */
export interface HealthSummary {
  /** How many members the matview has scored. */
  members: number
  /** Mean Resonance Health across scored members, 0..100 (0 when none). */
  meanHealth: number
  /** Tier counts (the green/amber/red split). */
  resonant: number
  cooling: number
  atRisk: number
  /** Weekly-active members (wam_status true). */
  weeklyActive: number
}

/** The platform lifecycle funnel counts (stranger -> ... -> advocate, mapped onto the real
 *  lifecycle_stage enum: new / activated / engaged / at_risk / dormant). */
export interface LifecycleFunnel {
  new: number
  activated: number
  engaged: number
  atRisk: number
  dormant: number
}

export const ZERO_HEALTH: HealthSummary = {
  members: 0,
  meanHealth: 0,
  resonant: 0,
  cooling: 0,
  atRisk: 0,
  weeklyActive: 0,
}

export const ZERO_FUNNEL: LifecycleFunnel = {
  new: 0,
  activated: 0,
  engaged: 0,
  atRisk: 0,
  dormant: 0,
}

/** The shape the platform RPC returns (untyped until database.types regenerates, ADR-246). */
interface PlatformSummaryRow {
  members: number | null
  mean_health: number | null
  resonant_count: number | null
  cooling_count: number | null
  at_risk_count: number | null
  wam_count: number | null
  stage_new: number | null
  stage_activated: number | null
  stage_engaged: number | null
  stage_at_risk: number | null
  stage_dormant: number | null
}

interface SpaceSummaryRow {
  members: number | null
  mean_health: number | null
  resonant_count: number | null
  cooling_count: number | null
  at_risk_count: number | null
  wam_count: number | null
}

const num = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// ── Platform reads (gate at the call site: the staff floor) ───────────────────

/**
 * The platform health summary + lifecycle funnel in one read. FAIL-SAFE: any error (a missing
 * matview / RPC pre-migration, an RLS hiccup) resolves to zeros, so the cockpit degrades to a
 * calm empty state. The caller MUST have passed the staff floor before calling.
 */
export async function getPlatformHealth(): Promise<{ summary: HealthSummary; funnel: LifecycleFunnel }> {
  try {
    const admin = createAdminClient()
    // The RPC isn't in the generated types yet (ADR-246), so cast the client for the call.
    const { data, error } = await (admin as unknown as {
      rpc: (fn: string) => Promise<{ data: PlatformSummaryRow[] | null; error: unknown }>
    }).rpc('dashboard_health_summary')
    if (error || !data || data.length === 0) return { summary: ZERO_HEALTH, funnel: ZERO_FUNNEL }
    const r = data[0]
    return {
      summary: {
        members: num(r.members),
        meanHealth: num(r.mean_health),
        resonant: num(r.resonant_count),
        cooling: num(r.cooling_count),
        atRisk: num(r.at_risk_count),
        weeklyActive: num(r.wam_count),
      },
      funnel: {
        new: num(r.stage_new),
        activated: num(r.stage_activated),
        engaged: num(r.stage_engaged),
        atRisk: num(r.stage_at_risk),
        dormant: num(r.stage_dormant),
      },
    }
  } catch {
    return { summary: ZERO_HEALTH, funnel: ZERO_FUNNEL }
  }
}

// ── Space reads (gate at the call site: entitlement + owner/admin, scoped by space_id) ──

/**
 * The per-Space health summary, scoped to the members reachable from this Space's CRM. FAIL-SAFE:
 * any error or a missing space_id resolves to zeros. The caller MUST have verified the Space's CRM
 * entitlement + owner/admin BEFORE calling; the space_id is the binding scope.
 */
export async function getSpaceHealth(spaceId: string): Promise<HealthSummary> {
  if (!spaceId) return ZERO_HEALTH
  try {
    const admin = createAdminClient()
    const { data, error } = await (admin as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: SpaceSummaryRow[] | null; error: unknown }>
    }).rpc('dashboard_space_health_summary', { _space_id: spaceId })
    if (error || !data || data.length === 0) return ZERO_HEALTH
    const r = data[0]
    return {
      members: num(r.members),
      meanHealth: num(r.mean_health),
      resonant: num(r.resonant_count),
      cooling: num(r.cooling_count),
      atRisk: num(r.at_risk_count),
      weeklyActive: num(r.wam_count),
    }
  } catch {
    return ZERO_HEALTH
  }
}

// ── The who-needs-attention worklist (reuses the Phase 1 Today ranker) ────────

/** One worklist row: a member sliding now, carrying their next move as a one-tap route into Today.
 *  A thin projection of a Today card so the worklist and Today agree by construction. */
export interface WorklistRow {
  contactId: string
  name: string
  /** The churn/lifecycle context label ("At risk" / "Cooling" / "Steady"). */
  context: string
  /** The one concrete "why now" line, in voice. */
  whyNow: string
  /** The playbook name + autonomy tier (the operator-facing badge). */
  playbookName: string
  autonomyTier: TodayCard['autonomyTier']
}

/** Map a Today card to a worklist row (the same ranked set Today shows, projected for the cockpit). */
function toWorklistRow(card: TodayCard): WorklistRow {
  return {
    contactId: card.contactId,
    name: card.name,
    context: card.context,
    whyNow: card.whyNow,
    playbookName: card.playbookName,
    autonomyTier: card.autonomyTier,
  }
}

/**
 * The who-needs-attention worklist for a scope, reusing buildTodayCards so it agrees with Vera Today
 * by construction (same ranker, same scoping). Pass a `spaceId` for the Space scope, or omit it for
 * the platform scope. FAIL-SAFE: buildTodayCards never throws (empty list on any error). Returns the
 * rows plus the count still owed on the Later shelf (the "how many more" tail).
 */
export async function getWorklist(opts: { spaceId?: string | null } = {}): Promise<{
  rows: WorklistRow[]
  laterCount: number
}> {
  const { cards, laterCount } = await buildTodayCards(opts)
  return { rows: cards.map(toWorklistRow), laterCount }
}

// ── Rising members (the "about to resonate" card · Altitude 1) ────────────────

/** One rising member: not yet resonant, but high activation propensity, the overlooked
 *  opportunity (who would convert if you simply reached out). Drills to the timeline. */
export interface RisingMember {
  contactId: string | null
  profileId: string
  name: string
  activationPropensity: number
  resonanceHealth: number
}

/**
 * Members about to resonate: high activation propensity, not yet in the resonant tier, the
 * overlooked pool worth a reach-out. FAIL-SAFE to an empty list. Platform scope only for v1
 * (the most overlooked-opportunity pattern lives platform-wide); the caller gates the read.
 */
export async function getRisingMembers(limit = 6): Promise<RisingMember[]> {
  const capped = Math.max(1, Math.min(50, limit))
  try {
    const admin = createAdminClient()
    const { data, error } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          neq: (col: string, val: string) => {
            gte: (col: string, val: number) => {
              order: (col: string, o: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: (ScoreRow & { activation_propensity: number | null })[] | null; error: unknown }>
              }
            }
          }
        }
      }
    })
      .from('member_engagement_scores')
      .select('profile_id, resonance_health, resonance_tier, lifecycle_stage, activation_propensity')
      .neq('resonance_tier', 'resonant')
      .gte('activation_propensity', 60)
      .order('activation_propensity', { ascending: false })
      .limit(capped)
    if (error || !data || data.length === 0) return []

    const profileIds = data.map((r) => r.profile_id)
    const { data: contactData } = await admin
      .from('contacts')
      .select('id, profile_id, display_name, email')
      .in('profile_id', profileIds)
    const contactByProfile = new Map<string, ContactNameRow>()
    for (const c of (contactData ?? []) as ContactNameRow[]) {
      if (c.profile_id && !contactByProfile.has(c.profile_id)) contactByProfile.set(c.profile_id, c)
    }

    return data.map((r) => {
      const c = contactByProfile.get(r.profile_id)
      const name = (c?.display_name || c?.email?.split('@')[0] || 'This member').trim()
      return {
        contactId: c?.id ?? null,
        profileId: r.profile_id,
        name,
        activationPropensity: num(r.activation_propensity),
        resonanceHealth: num(r.resonance_health),
      }
    })
  } catch {
    return []
  }
}

// ── One member's scores (the Person view score row · Altitude 3) ──────────────

/** One member's dashboard scores, for the Person view score row. FAIL-SAFE to nulls. */
export interface MemberScores {
  resonanceHealth: number | null
  resonanceTier: ResonanceTier | null
  churnRisk: string | null
  activationPropensity: number | null
  lifecycleStage: string | null
  nextBestAction: string | null
}

export const NO_MEMBER_SCORES: MemberScores = {
  resonanceHealth: null,
  resonanceTier: null,
  churnRisk: null,
  activationPropensity: null,
  lifecycleStage: null,
  nextBestAction: null,
}

type MemberScoreRow = {
  resonance_health: number | null
  resonance_tier: string | null
  churn_risk: string | null
  activation_propensity: number | null
  lifecycle_stage: string | null
  next_best_action: string | null
}

/**
 * One member's shared scores (Resonance Health + tier + churn + propensity + lifecycle + next
 * move), read from the matview. FAIL-SAFE: a missing matview, no row, or any error returns nulls,
 * so the Person view shows "not scored yet" rather than crashing. The per-signal "why" is Phase 3;
 * this returns the bare scores only. The caller (the staff-gated person page) is the authority.
 */
export async function getMemberScores(profileId: string | null): Promise<MemberScores> {
  if (!profileId) return NO_MEMBER_SCORES
  try {
    const admin = createAdminClient()
    const { data, error } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: MemberScoreRow | null; error: unknown }>
          }
        }
      }
    })
      .from('member_engagement_scores')
      .select('resonance_health, resonance_tier, churn_risk, activation_propensity, lifecycle_stage, next_best_action')
      .eq('profile_id', profileId)
      .maybeSingle()
    if (error || !data) return NO_MEMBER_SCORES
    return {
      resonanceHealth: data.resonance_health,
      resonanceTier: data.resonance_tier ? asTier(data.resonance_tier) : null,
      churnRisk: data.churn_risk,
      activationPropensity: data.activation_propensity,
      lifecycleStage: data.lifecycle_stage,
      nextBestAction: data.next_best_action,
    }
  } catch {
    return NO_MEMBER_SCORES
  }
}

// ── Member-list drill-down (every chart point lands on a real member list) ────

/** The drill-down filters the cockpit charts route to. A tier (the StatCard band) or a lifecycle
 *  stage (a funnel step). Validated against the matview's columns before use. */
export type MemberFilter =
  | { kind: 'tier'; value: ResonanceTier }
  | { kind: 'lifecycle'; value: string }

/** One row in a drilled member list: the member + their shared score, linking to the person
 *  timeline (the one front door). */
export interface MemberListRow {
  /** The CRM contact id (the person detail / timeline subject). Null when no contact stitched. */
  contactId: string | null
  profileId: string
  name: string
  resonanceHealth: number
  resonanceTier: ResonanceTier
  lifecycleStage: string | null
}

const TIER_VALUES: readonly ResonanceTier[] = ['resonant', 'cooling', 'at_risk']
const LIFECYCLE_VALUES: readonly string[] = ['new', 'activated', 'engaged', 'at_risk', 'dormant']

type ScoreRow = {
  profile_id: string
  resonance_health: number | null
  resonance_tier: string | null
  lifecycle_stage: string | null
}
type ContactNameRow = { id: string; profile_id: string | null; display_name: string | null; email: string }

function asTier(v: string | null): ResonanceTier {
  return v && (TIER_VALUES as readonly string[]).includes(v) ? (v as ResonanceTier) : 'at_risk'
}

/**
 * List the members behind a chart point (a tier band or a lifecycle stage), newest-risk first,
 * each carrying its shared score + a contact id for the timeline drill. FAIL-SAFE: any error, an
 * absent matview, or an invalid filter resolves to an empty list. Pass a `spaceId` to scope to a
 * Space's reachable members; omit it for the platform. The caller MUST gate the scope first.
 */
export async function listMembersByFilter(
  filter: MemberFilter,
  opts: { spaceId?: string | null; limit?: number } = {},
): Promise<MemberListRow[]> {
  // Validate the filter against the known column values (no free-form column injection).
  if (filter.kind === 'tier' && !(TIER_VALUES as readonly string[]).includes(filter.value)) return []
  if (filter.kind === 'lifecycle' && !LIFECYCLE_VALUES.includes(filter.value)) return []
  const limit = Math.max(1, Math.min(500, opts.limit ?? 200))

  try {
    const admin = createAdminClient()
    const q = (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: ScoreRow[] | null; error: unknown }>
            }
          }
        }
      }
    })
      .from('member_engagement_scores')
      .select('profile_id, resonance_health, resonance_tier, lifecycle_stage')

    const col = filter.kind === 'tier' ? 'resonance_tier' : 'lifecycle_stage'
    const { data: scoreData, error } = await q.eq(col, filter.value).order('resonance_health', { ascending: true }).limit(limit)
    if (error || !scoreData || scoreData.length === 0) return []

    let rows = scoreData

    // Per-Space scope: keep only profiles reachable from this Space's CRM contacts.
    let spaceProfileIds: Set<string> | null = null
    if (opts.spaceId) {
      const { data: spaceRows } = await admin
        .from('contact_interactions')
        .select('subject_id')
        .eq('space_id', opts.spaceId)
        .eq('subject_kind', 'contact')
      const subjectIds = ((spaceRows ?? []) as { subject_id: string }[]).map((r) => r.subject_id)
      if (subjectIds.length === 0) return []
      const { data: spaceContacts } = await admin
        .from('contacts')
        .select('profile_id')
        .in('id', subjectIds)
      spaceProfileIds = new Set(
        ((spaceContacts ?? []) as { profile_id: string | null }[])
          .map((c) => c.profile_id)
          .filter((p): p is string => !!p),
      )
      rows = rows.filter((r) => spaceProfileIds!.has(r.profile_id))
      if (rows.length === 0) return []
    }

    // Resolve names + a contact id (the timeline subject) for the surviving members.
    const profileIds = rows.map((r) => r.profile_id)
    const { data: contactData } = await admin
      .from('contacts')
      .select('id, profile_id, display_name, email')
      .in('profile_id', profileIds)
    const contactByProfile = new Map<string, ContactNameRow>()
    for (const c of (contactData ?? []) as ContactNameRow[]) {
      if (c.profile_id && !contactByProfile.has(c.profile_id)) contactByProfile.set(c.profile_id, c)
    }

    return rows.map((r) => {
      const c = contactByProfile.get(r.profile_id)
      const name = (c?.display_name || c?.email?.split('@')[0] || 'This member').trim()
      return {
        contactId: c?.id ?? null,
        profileId: r.profile_id,
        name,
        resonanceHealth: num(r.resonance_health),
        resonanceTier: asTier(r.resonance_tier),
        lifecycleStage: r.lifecycle_stage,
      }
    })
  } catch {
    return []
  }
}
