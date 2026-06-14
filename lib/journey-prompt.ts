// Daily next-step Journey prompt (docs/JOURNEYS.md §15 P6). Reads the member's enrolled-Journey
// v2 progress and builds the one prompt the daily cron sends: the Journey, the next lesson, and a
// short time ask. Voice canon (CONTENT-VOICE notification rules): a fact plus a small invitation,
// never guilt or fake urgency. Server-only.

import { getMemberJourneyProgress } from '@/lib/journeys/progress'

export interface JourneyPrompt {
  /** The Journey whose next step this is (used as the notification reference). */
  planId: string
  journeyTitle: string
  /** The next lesson's title (field name kept for the cron + tests). */
  practiceTitle: string
  /** A short time ask ("5 minutes"). May be empty. */
  timeNote: string
}

/** Build the prompt body. Pure — the cron and its tests share it. "[Journey]: [Lesson]. [time]." */
export function formatJourneyPrompt(p: { journeyTitle: string; practiceTitle: string; timeNote: string }): string {
  const tail = p.timeNote ? `. ${p.timeNote}` : ''
  return `${p.journeyTitle}: ${p.practiceTitle}${tail}`
}

/**
 * The member's next lesson across their enrolled Journeys, or null when nothing is left to do
 * (nothing to nudge). Picks the first Journey with a not-yet-done lesson, in order.
 */
export async function getDailyJourneyPrompt(profileId: string): Promise<JourneyPrompt | null> {
  let progress
  try {
    progress = await getMemberJourneyProgress(profileId)
  } catch {
    return null
  }
  for (const p of progress) {
    if (!p.nextLesson) continue
    return { planId: p.planId, journeyTitle: p.title, practiceTitle: p.nextLesson.title, timeNote: '' }
  }
  return null
}
