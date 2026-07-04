'use server'

import { getPlan, getVeraReview, normalizeJourneyMeeting } from '@/lib/journey-plans'
import { getJourneyCapabilities } from '@/lib/core/load-capabilities'
import type { JourneySettingsProps } from '@/components/journey/v2/journey-settings'

// The Journey admin rail's read seam (ADR-515 Phase 6). One getter feeds every journey rail module:
// Settings (mounted inline), the Builder/Layout affordance (links out), Export, and the Danger zone.
// It re-resolves journey.editSettings server-side via getJourneyCapabilities (author OR staff OR a
// parent-scope manager) and returns null for anyone else, so each module renders no chrome for a
// non-owner. Read-only; the underlying edit/delete/export actions each re-check ownership themselves.

/** The props JourneySettings needs, minus the rail-controlled `hideIdentity` flag. */
type SettingsData = Omit<JourneySettingsProps, 'hideIdentity'>

export interface JourneyRailData {
  planId: string
  slug: string
  title: string
  /** The full JourneySettings prop bundle, so the rail can mount the editor inline. */
  settings: SettingsData
}

/** Load a Journey's editable settings bundle by slug, but only for a viewer who may edit it
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

  const settings: SettingsData = {
    planId: plan.id,
    initialTitle: plan.title,
    initialSummary: plan.summary,
    initialIntro: plan.intro,
    initialEmoji: plan.emoji,
    initialAccent: plan.accent,
    initialVisibility: plan.visibility,
    initialStatus: plan.status,
    initialCompletionGems: plan.completion_gems,
    initialCertificateEnabled: plan.certificate_enabled,
    initialDripIntervalDays: plan.drip_interval_days,
    initialCoverImage: plan.cover_image,
    initialReview: review,
    initialDifficulty: p.difficulty ?? null,
    initialCategory: p.category ?? null,
    initialTags: p.tags ?? [],
    initialDailyMinutes: p.daily_minutes ?? null,
    initialEnrollCap: p.enroll_cap ?? null,
    initialMeeting: normalizeJourneyMeeting(plan.meeting),
  }

  return { planId: plan.id, slug: plan.slug, title: plan.title, settings }
}
