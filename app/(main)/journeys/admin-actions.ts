'use server'

import { getPlan, getVeraReview, normalizeJourneyMeeting } from '@/lib/journey-plans'
import { readJourneyOutcomes } from '@/lib/journeys/outcomes'
import { readJourneyGuarantee } from '@/lib/journeys/guarantee'
import { getJourneyCapabilities } from '@/lib/core/load-capabilities'
import type { PlanStatus, StoredVeraReview } from '@/lib/journey-plans'
import { getMyProfileId } from '@/lib/auth'
import { checkJourneySell } from '@/lib/journeys/sell-gate'
import { getJourneyOffer } from '@/lib/journeys/paid'
import { resolveSpacePayoutPromptById } from '@/lib/billing/payout-prompt-resolve'
import type { PayoutPrompt } from '@/lib/billing/payout-prompt'
import { listMembershipTiers } from '@/lib/spaces/memberships'
import { loadRootSpaceId } from '@/lib/spaces/store'

// The Journey admin rail's read seam (ADR-515 Phase 6). One getter feeds every journey rail module:
// Settings (mounted inline), the Builder/Layout affordance (links out), Export, and the Danger zone.
// It re-resolves journey.editSettings server-side via getJourneyCapabilities (author OR staff OR a
// parent-scope manager) and returns null for anyone else, so each module renders no chrome for a
// non-owner. Read-only; the underlying edit/delete/export actions each re-check ownership themselves.

export interface JourneyRailData {
  planId: string
  slug: string
  title: string
  /**
   * The plan row's editable columns, keyed by column name, which is the Journey manifest's field path
   * (ADR-1246). The settings module reads its values off this through `journeyRailValues()`, so the
   * rail's initial state and the manifest's declared fields cannot name a column two different ways.
   * `meeting` is already normalized; nothing here is a prop bundle for a hand-drawn editor any more.
   */
  row: Record<string, unknown>
  /** The cover's focal point (CSS object-position), a property of the cover control rather than a field. */
  coverFocus: string | null
  /** The moderation state the visibility select reads beside its own value. */
  status: PlanStatus
  /** Vera's last rank-eligibility review, if this Journey has been published/reviewed. */
  review: StoredVeraReview | null
  /** Active membership tiers of the owning Space, for the LIVE-411 select. Empty when personal. */
  spaceTiers: { value: string; label: string }[]
}

/** Load a Journey's editable settings by slug, but only for a viewer who may edit it
 *  (journey.editSettings). Returns null otherwise — the rail modules render nothing. */
export async function getJourneyRailData(slug: string): Promise<JourneyRailData | null> {
  const loaded = await getPlan(slug)
  if (!loaded) return null
  const { plan } = loaded

  const caps = await getJourneyCapabilities(plan.id)
  if (!caps.has('journey.editSettings')) return null

  const review = await getVeraReview(plan.id)
  // Discovery/delivery attributes ride the plan row under looser typing (mirrors the edit page).
  const p = plan as unknown as {
    difficulty?: string | null
    category?: string | null
    tags?: string[]
    daily_minutes?: number | null
    enroll_cap?: number | null
    space_tier_id?: string | null
  }

  const row: Record<string, unknown> = {
    title: plan.title,
    summary: plan.summary,
    cover_image: plan.cover_image,
    logo_image: plan.logo_image ?? null,
    header_overlay_style: plan.header_overlay_style ?? null,
    header_overlay_color: plan.header_overlay_color ?? null,
    completion_gems: plan.completion_gems,
    drip_interval_days: plan.drip_interval_days,
    certificate_enabled: plan.certificate_enabled,
    visibility: plan.visibility,
    difficulty: p.difficulty ?? null,
    category: p.category ?? null,
    tags: p.tags ?? [],
    daily_minutes: p.daily_minutes ?? null,
    enroll_cap: p.enroll_cap ?? null,
    space_tier_id: p.space_tier_id ?? null,
    meeting: normalizeJourneyMeeting(plan.meeting),
    outcomes: readJourneyOutcomes(plan.page_config),
    guarantee: readJourneyGuarantee(plan.page_config),
  }

  const root = await loadRootSpaceId()
  const spaceId = plan.space_id && plan.space_id !== root ? plan.space_id : null
  const spaceTiers = spaceId
    ? [
        { value: '', label: 'Anyone' },
        ...(await listMembershipTiers(spaceId)).flatMap((t) =>
          t.id ? [{ value: t.id, label: t.name }] : [],
        ),
      ]
    : [{ value: '', label: 'Anyone (attach a Space first)' }]

  return {
    planId: plan.id,
    slug: plan.slug,
    title: plan.title,
    row,
    coverFocus: plan.cover_focus ?? null,
    status: plan.status,
    review,
    spaceTiers,
  }
}

// ── The sell module's read seam (ADR-1397) ───────────────────────────────────────────────────────
//
// Separate from getJourneyRailData on purpose: that one answers "may you EDIT this Journey", and
// selling asks a different question with a different answer. A Space editor on a FREE Space passes
// journey.editSettings and must still be told, plainly, that pricing needs a paid Space. Folding the
// two would have made `canSell` look like a flavour of `canEdit`, which is exactly the conflation
// ADR-838 exists to prevent.

export interface JourneySellData {
  planId: string
  slug: string
  title: string
  /** May this viewer set a price? False carries `reason`. */
  canSell: boolean
  /** Why not, in plain member-facing copy. Null when they can. */
  reason: string | null
  /** The live offer, or null when the Journey is free. */
  offer: { productId: string; priceCents: number; enrolled: number; enrollCap: number | null } | null
  /** Connect prompt for this Space's owner (LIVE-425). Null when they cannot sell, or when
   *  the account is already ready. A setup step, never a gate: the price form still works. */
  payoutPrompt: PayoutPrompt | null
}

export async function getJourneySellData(slug: string): Promise<JourneySellData | null> {
  const loaded = await getPlan(slug)
  if (!loaded) return null
  const { plan } = loaded

  // The rail never renders for someone who cannot edit the Journey at all.
  const caps = await getJourneyCapabilities(plan.id)
  if (!caps.has('journey.editSettings')) return null

  const callerId = await getMyProfileId()
  const [gate, offer] = await Promise.all([
    checkJourneySell(plan.id, callerId),
    getJourneyOffer(plan.id),
  ])

  // Connect is a setup step on the Space owner, not a second price wall. Skip the read when
  // this viewer cannot sell (free Space / personal Journey): they already have a different
  // sentence, and two walls at once is noise.
  const payoutPrompt =
    gate.ok && plan.space_id
      ? await resolveSpacePayoutPromptById({
          spaceId: plan.space_id,
          viewerProfileId: callerId,
          channels: ['journeys'],
        })
      : null

  return {
    planId: plan.id,
    slug: plan.slug,
    title: plan.title,
    canSell: gate.ok,
    reason: gate.ok ? null : gate.error,
    offer: offer
      ? {
          productId: offer.productId,
          priceCents: offer.priceCents,
          enrolled: offer.enrolled,
          enrollCap: offer.enrollCap,
        }
      : null,
    payoutPrompt,
  }
}
