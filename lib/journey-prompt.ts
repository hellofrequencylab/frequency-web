// Daily next-step Journey prompt (docs/JOURNEYS.md §15 P6). Reads the member's active-journey
// progress and builds the one prompt the daily cron sends: the Journey, the next practice, and
// the time ask. Voice canon (CONTENT-VOICE notification rules): a fact plus a small invitation,
// never guilt or fake urgency. Server-only.

import { getActiveJourneyProgress } from '@/lib/journey-plans'

export interface JourneyPrompt {
  /** The Journey whose next step this is (used as the notification reference). */
  planId: string
  journeyTitle: string
  /** The resolved-tier title, or the practice title. */
  practiceTitle: string
  /** A short time / cadence ask ("5 minutes" / "Daily"). May be empty. */
  timeNote: string
}

/** Build the prompt body. Pure — the cron and its tests share it. "[Journey]: [Practice]. [time]." */
export function formatJourneyPrompt(p: { journeyTitle: string; practiceTitle: string; timeNote: string }): string {
  const tail = p.timeNote ? `. ${p.timeNote}` : ''
  return `${p.journeyTitle}: ${p.practiceTitle}${tail}`
}

/**
 * The member's next step across their active Journeys, or null when everything is on track
 * (nothing to nudge). Picks the first Journey with a not-yet-on-track step, in order.
 */
export async function getDailyJourneyPrompt(profileId: string): Promise<JourneyPrompt | null> {
  let progress
  try {
    progress = await getActiveJourneyProgress(profileId)
  } catch {
    return null
  }
  for (const p of progress) {
    const next = p.nextItem
    if (!next) continue
    const practiceTitle = next.tierContent?.title ?? next.practice?.title ?? 'your next practice'
    const mins = next.tierContent?.est_minutes
    const timeNote = mins ? `${mins} minutes` : (next.cadence ?? next.practice?.cadence ?? '')
    return { planId: p.plan.id, journeyTitle: p.plan.title, practiceTitle, timeNote: String(timeNote ?? '') }
  }
  return null
}
