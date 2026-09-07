'use server'

import { getPlan, getVeraReview, normalizeJourneyMeeting } from '@/lib/journey-plans'
import { getJourneyCapabilities } from '@/lib/core/load-capabilities'
import type { PlanStatus, StoredVeraReview } from '@/lib/journey-plans'

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
    meeting: normalizeJourneyMeeting(plan.meeting),
  }

  return {
    planId: plan.id,
    slug: plan.slug,
    title: plan.title,
    row,
    coverFocus: plan.cover_focus ?? null,
    status: plan.status,
    review,
  }
}
