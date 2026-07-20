// PER-SPACE CRM FUNNEL ANALYTICS (ADR-381). The READ-ONLY conversion + engagement snapshot a Space
// owner sees on their CRM board: WHERE deals sit across the pipeline (count + value per stage, in
// stage order, with a first-stage -> won conversion rate), HOW MANY contacts they can reach (total,
// subscribed vs unsubscribed), and HOW their sending performs (the deliverability snapshot). One read,
// gated, fail-safe.
//
// REUSE, DO NOT REBUILD (ADR-381):
//   • Pipeline shape comes from lib/crm/pipeline.ts (getStages + getDeals, both space-scoped + already
//     fail-safe). We do not re-query crm_stages / crm_deals here.
//   • Email engagement comes from lib/spaces/email-analytics.ts (getSpaceEmailStats — owner-gated,
//     fail-safe). We surface its deliverability signal rather than recomputing.
//   • Contacts is the one table we read directly (it is not in the generated DB types — ADR-246), via
//     the admin cast + a space_id filter, mirroring lib/spaces/audiences.ts.
//
// TENANCY (ADR-246/328/329, mirrors lib/spaces/email-analytics.ts). This read SELF-GATES on
// canEditProfile (owner / admin / editor) via getSpaceCapabilities, with a platform janitor preview
// allowed (view only). Every query filters on space_id, so another Space's rows can never leak in.
// FAIL-SAFE: an unauthorized caller, a missing table, or any error resolves to an EMPTY snapshot
// (zeros / []), so a render never breaks and a leak is impossible. All strings here are data, not copy;
// the panel carries the voice (CONTENT-VOICE).

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isJanitor } from '@/lib/core/roles'
import { getStages, getDeals, type CrmStage, type CrmDeal } from '@/lib/crm/pipeline'
import { getSpaceEmailStats, type SpaceEmailStats } from '@/lib/spaces/email-analytics'
import { scoreContactRisk, type RiskFactor } from '@/lib/spaces/contact-risk'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** One stage in the funnel: its identity + how many deals sit in it and their summed value. The
 *  `kind` lets the panel color the won / lost stages and lets the conversion math find the ends. */
export interface FunnelStage {
  id: string
  name: string
  kind: CrmStage['kind']
  /** Deals currently in this stage (scoped to this Space). */
  count: number
  /** Summed value of the deals in this stage. */
  value: number
}

/** The contacts a Space can reach, split by consent. `total` is every contact in the Space;
 *  `subscribed` + `unsubscribed` are the two decided consent states (an `unknown` contact is counted
 *  in `total` but in neither bucket, since it is added-but-not-yet-mailable). */
export interface ContactReach {
  total: number
  subscribed: number
  unsubscribed: number
}

/** One at-risk contact the cockpit surfaces: enough to name them, show WHY, and offer a win-back. The
 *  `factors` come straight from the pure scorer so the panel can explain the flag. */
export interface AtRiskContact {
  id: string
  email: string
  displayName: string | null
  score: number
  factors: RiskFactor[]
}

/** The per-Space at-risk / churn slice the cockpit shows: how many of THIS Space's contacts are going
 *  cold, and the worst few (highest score first) so an owner can act. Derived by the PURE scorer
 *  (lib/spaces/contact-risk.ts) over the raw signals already on the contact row, so it works before any
 *  writer persists into contacts.risk_score. */
export interface AtRiskSummary {
  /** How many of the Space's contacts scored at-risk. */
  count: number
  /** The worst offenders (capped), highest score first, for the cockpit list + the win-back hook. */
  top: AtRiskContact[]
}

/** The whole snapshot the panel renders. All counts are whole numbers; `conversionRate` is a fraction
 *  in [0, 1] (the panel renders it as a percentage). `email` is the deliverability snapshot reused
 *  from lib/spaces/email-analytics.ts. */
export interface CrmFunnel {
  stages: FunnelStage[]
  /** Total deals across every stage (the funnel mouth). */
  totalDeals: number
  /** Summed value across every stage. */
  totalValue: number
  /** Deals that reached a won stage (the funnel floor). */
  wonCount: number
  /** wonCount / (deals that entered the funnel), a fraction in [0, 1]. 0 when there are no deals. */
  conversionRate: number
  reach: ContactReach
  /** The at-risk / churn slice (count + worst offenders), derived by the pure scorer. */
  atRisk: AtRiskSummary
  email: SpaceEmailStats
}

const ZERO_EMAIL: SpaceEmailStats = {
  sent: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  suppressed: 0,
  failed: 0,
  opened: 0,
  clicked: 0,
  bounceRate: 0,
  complaintRate: 0,
  openRate: 0,
  clickRate: 0,
}

const ZERO_REACH: ContactReach = { total: 0, subscribed: 0, unsubscribed: 0 }

const ZERO_AT_RISK: AtRiskSummary = { count: 0, top: [] }

/** Most at-risk contacts to surface in the cockpit list (the worst offenders; the count is unbounded). */
const AT_RISK_TOP_LIMIT = 8

const EMPTY_FUNNEL: CrmFunnel = {
  stages: [],
  totalDeals: 0,
  totalValue: 0,
  wonCount: 0,
  conversionRate: 0,
  reach: ZERO_REACH,
  atRisk: ZERO_AT_RISK,
  email: ZERO_EMAIL,
}

// ── PURE helpers (no IO, unit-testable) ─────────────────────────────────────────────────────────

/**
 * The conversion rate for a funnel: won deals over the deals that entered it, a fraction in [0, 1].
 * PURE. FAIL-SAFE math: 0 when nothing entered (never a divide-by-zero), and clamped to [0, 1] so a
 * malformed count (more won than entered) can never report above 100%.
 */
export function computeConversionRate(wonCount: number, enteredCount: number): number {
  if (!Number.isFinite(wonCount) || !Number.isFinite(enteredCount) || enteredCount <= 0) return 0
  const rate = wonCount / enteredCount
  if (rate < 0) return 0
  return rate > 1 ? 1 : rate
}

/**
 * Fold stages + their deals into the ordered funnel rows + the totals + the conversion rate. PURE so
 * the whole derivation is unit-testable without touching the DB. Stages keep the order they arrive in
 * (getStages already sorts by sort_order). A deal with no stage_id, or one pointing at a stage that no
 * longer exists, is still counted toward the TOTAL + the conversion denominator (it entered the
 * funnel) but lands in no stage row, so the bars and the totals stay honest.
 */
export function buildFunnel(
  stages: Pick<CrmStage, 'id' | 'name' | 'kind'>[],
  deals: Pick<CrmDeal, 'stage_id' | 'value' | 'status'>[],
): Pick<CrmFunnel, 'stages' | 'totalDeals' | 'totalValue' | 'wonCount' | 'conversionRate'> {
  const counts = new Map<string, { count: number; value: number }>()
  for (const s of stages) counts.set(s.id, { count: 0, value: 0 })

  let totalDeals = 0
  let totalValue = 0
  let wonCount = 0
  for (const d of deals) {
    const value = Number(d.value) || 0
    totalDeals += 1
    totalValue += value
    if (d.status === 'won') wonCount += 1
    const bucket = d.stage_id ? counts.get(d.stage_id) : undefined
    if (bucket) {
      bucket.count += 1
      bucket.value += value
    }
  }

  const rows: FunnelStage[] = stages.map((s) => {
    const b = counts.get(s.id) ?? { count: 0, value: 0 }
    return { id: s.id, name: s.name, kind: s.kind, count: b.count, value: b.value }
  })

  return {
    stages: rows,
    totalDeals,
    totalValue,
    wonCount,
    conversionRate: computeConversionRate(wonCount, totalDeals),
  }
}

/** The known consent states, so a stray value from the contacts table is counted toward the total but
 *  never mis-bucketed. `unknown` is added-but-not-yet-mailable (it sits in `total` only). */
function consentBucket(raw: unknown): 'subscribed' | 'unsubscribed' | null {
  if (raw === 'subscribed') return 'subscribed'
  if (raw === 'unsubscribed') return 'unsubscribed'
  return null
}

// ── PURE: fold the raw contact-risk rows into the at-risk summary ─────────────────────────────────

/** A raw contact row carrying the signals the pure scorer weighs. All optional/untyped: the columns
 *  the at-risk write layer maintains (risk_score / at_risk) may not exist yet (ADR-246), so we always
 *  derive live from the base signals here and never depend on the projection columns being populated. */
export type ContactRiskRow = {
  id?: string | null
  email?: string | null
  display_name?: string | null
  consent_state?: string | null
  engagement_score?: number | null
  last_seen_at?: string | null
}

/**
 * Fold contact rows into the at-risk summary: score each with the PURE scorer, count the flagged, and
 * return the worst `limit` (highest score first). PURE so the whole derivation is unit-testable with no
 * DB. `now` is threaded so tests pin the clock. A row missing an id is skipped (it cannot be acted on).
 */
export function buildAtRiskSummary(
  rows: ContactRiskRow[],
  limit = AT_RISK_TOP_LIMIT,
  now?: number,
): AtRiskSummary {
  const scored: AtRiskContact[] = []
  for (const r of rows) {
    if (!r?.id) continue
    const { score, atRisk, factors } = scoreContactRisk({
      lastSeenAt: r.last_seen_at ?? null,
      engagementScore: typeof r.engagement_score === 'number' ? r.engagement_score : null,
      consentState: r.consent_state ?? null,
      now,
    })
    if (!atRisk) continue
    scored.push({
      id: r.id,
      email: r.email ?? '',
      displayName: r.display_name ?? null,
      score,
      factors,
    })
  }
  scored.sort((a, b) => b.score - a.score)
  return { count: scored.length, top: scored.slice(0, Math.max(0, limit)) }
}

// ── IO seam: the untyped contacts read (table not in generated types yet, ADR-246) ────────────────

type ContactQuery = {
  select: (cols: string) => ContactQuery
  eq: (col: string, val: string) => ContactQuery
  then: (
    resolve: (r: { data: Record<string, unknown>[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

function contactsTable(): ContactQuery {
  const dbc = createAdminClient() as unknown as { from: (t: string) => ContactQuery }
  return dbc.from('contacts')
}

/** Whether the current caller may read this Space's funnel analytics: an editor+ of the Space, OR a
 *  platform janitor previewing as staff (view only). FAIL-SAFE: anonymous / missing Space -> false.
 *  Mirrors canReadSpaceEmail in lib/spaces/email-analytics.ts so the read authority is identical. */
async function canReadSpaceFunnel(spaceId: string): Promise<boolean> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return false
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  return caps.canEditProfile || isJanitor(caller?.webRole)
}

/** The contact reach for a Space: total contacts + the subscribed / unsubscribed split, over the
 *  Space's OWN contacts (space_id filter, so another Space's contacts can never leak in). FAIL-SAFE to
 *  zeros on a missing table or any error. */
async function getContactReach(spaceId: string): Promise<ContactReach> {
  try {
    const { data, error } = await contactsTable().select('consent_state').eq('space_id', spaceId)
    if (error || !data) return ZERO_REACH
    let subscribed = 0
    let unsubscribed = 0
    for (const row of data) {
      const bucket = consentBucket(row.consent_state)
      if (bucket === 'subscribed') subscribed += 1
      else if (bucket === 'unsubscribed') unsubscribed += 1
    }
    return { total: data.length, subscribed, unsubscribed }
  } catch {
    return ZERO_REACH
  }
}

/** The at-risk / churn summary for a Space: score every one of the Space's OWN contacts (space_id
 *  filter, so another Space's contacts can never leak in) with the PURE scorer and fold to the count +
 *  worst offenders. Reads the raw signals already on the contact row, so it works BEFORE any writer
 *  persists into contacts.risk_score. FAIL-SAFE to an empty summary on a missing table / column / any
 *  error (ADR-246: the extra columns may be absent pre-regeneration; only base columns are selected). */
async function getAtRiskSummary(spaceId: string): Promise<AtRiskSummary> {
  try {
    const { data, error } = await contactsTable()
      .select('id, email, display_name, consent_state, engagement_score, last_seen_at')
      .eq('space_id', spaceId)
    if (error || !data) return ZERO_AT_RISK
    return buildAtRiskSummary(data as ContactRiskRow[])
  } catch {
    return ZERO_AT_RISK
  }
}

// ── PUBLIC READ (gated, fail-safe) ────────────────────────────────────────────────────────────────

/**
 * A Space's CRM funnel snapshot: the pipeline funnel (count + value per stage, in stage order, with a
 * first-stage -> won conversion rate), contact reach (total + subscribed / unsubscribed), and the email
 * deliverability snapshot. Gated on canEditProfile (or a staff janitor preview), every read scoped to
 * THIS space_id.
 *
 * REUSE: stages + deals come from lib/crm/pipeline.ts (already space-scoped + fail-safe); the email
 * half comes from lib/spaces/email-analytics.ts (already owner-gated + fail-safe); only contacts is
 * read here, through the admin cast with a space_id filter.
 *
 * FAIL-SAFE: an unauthorized caller, a missing table, or any error resolves to an EMPTY snapshot
 * (zeros / []), so a render never breaks and a leak is impossible (zeros reveal nothing).
 */
export async function getSpaceCrmFunnel(spaceId: string): Promise<CrmFunnel> {
  if (!spaceId) return EMPTY_FUNNEL
  if (!(await canReadSpaceFunnel(spaceId))) return EMPTY_FUNNEL

  try {
    // getStages / getDeals are space-scoped + fail-safe ([] on error); getSpaceEmailStats self-gates
    // and is fail-safe (zeros); getContactReach + getAtRiskSummary are fail-safe (zeros / empty). So the
    // snapshot can never throw.
    const [stages, deals, reach, atRisk, email] = await Promise.all([
      getStages(spaceId),
      getDeals(spaceId),
      getContactReach(spaceId),
      getAtRiskSummary(spaceId),
      getSpaceEmailStats(spaceId),
    ])
    const funnel = buildFunnel(stages, deals)
    return { ...funnel, reach, atRisk, email }
  } catch {
    return EMPTY_FUNNEL
  }
}
