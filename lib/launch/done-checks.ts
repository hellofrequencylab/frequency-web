// WHAT COUNTS AS DONE (VLS-02). A launch step is done when the real thing exists, whoever made it: a Circle
// opened from the Circles page flips the Circle step with no launch UI involved, the way
// lib/onboarding/status.ts derives the Get Started list from rows. The launch row (VLS-01) only remembers
// where the person stopped and what they chose to skip. PURE over plain row facts, so a probe can run it.

import { LAUNCH_STEP_IDS, launchStep, type LaunchStepId } from './steps.ts'

/** The facts the checks read, taken from the Space's rows (lib/launch/rows.ts). */
export interface LaunchRows {
  /** spaces.preferences (raw blob). */
  preferences: unknown
  /** spaces.tagline. */
  tagline: string | null
  /** spaces.about. */
  about: string | null
  /** Events hosted by the Space and not cancelled or removed. */
  eventCount: number
  /** Circles of the Space other than its automatic primary Circle. */
  circleCount: number
  /** Journeys authored for the Space. */
  journeyCount: number
  /** People in the Space's contact list. */
  contactCount: number
  /** The owner's payouts account can take money now (charges and payouts on). */
  payoutsReady: boolean
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function hasText(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

export function launchDone(rows: LaunchRows): Record<LaunchStepId, boolean> {
  const prefs = record(rows.preferences)
  const profile = record(prefs.profileData)
  const offerings = Array.isArray(profile.offerings) ? profile.offerings : []
  return {
    spotlight: record(prefs.spotlight).published === true,
    // The setup walk's two anchors: the one-line tagline and the story. Everything after is polish.
    space: hasText(rows.tagline) && (hasText(rows.about) || hasText(profile.about)),
    offer: offerings.some((o) => hasText(record(o).title)),
    website: prefs.websitePublished === true,
    event: rows.eventCount > 0,
    circle: rows.circleCount > 0,
    journey: rows.journeyCount > 0,
    people: rows.contactCount > 0,
    paid: rows.payoutsReady,
  }
}

/** The launch counts as launched when every required step is done. A skipped optional step never blocks it. */
export function isLaunched(done: Record<LaunchStepId, boolean>): boolean {
  return LAUNCH_STEP_IDS.every((id) => !launchStep(id).required || done[id])
}
