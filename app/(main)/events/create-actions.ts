'use server'

// Server action for Vera's event Spark — the AI half of the /events/new composer.
// Mirrors the Journeys/Practices spark actions (sparkJourneyAction / sparkPracticeAction):
// it drafts an event from a few wizard answers (plus an optional pasted flyer) and writes
// NOTHING. The wizard reviews/edits the draft, then creates it through the SHARED saveDraft
// action (app/(main)/events/scan/actions.ts), so a sparked event rides the exact same draft
// engine → editor → publish ('mine' / 'posted' + claim token) flow as a poster scan.

import { getMyProfileId } from '@/lib/auth'
import { draftEventSpark } from '@/lib/ai/events-ai'
import type { EventSparkAnswers, ExtractedEvent } from '@/lib/events/types'

export type SparkEventResult =
  | { ok: true; draft: ExtractedEvent }
  | { ok: false; reason: 'unauthorized' | 'ai_unavailable' }

/**
 * Draft an event from the wizard's answers. Deferred: nothing is persisted here. Returns
 * the ExtractedEvent for the review step, or a reason the wizard shows as a plain fallback
 * (sign in, or "Vera is off — fill it in by hand"). AI off / over budget => ai_unavailable
 * (the module gates internally), so the product never depends on the model being up.
 */
export async function sparkEventAction(
  answers: EventSparkAnswers,
  sourceText?: string,
): Promise<SparkEventResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, reason: 'unauthorized' }

  const draft = await draftEventSpark({ answers, sourceText, profileId })
  if (!draft) return { ok: false, reason: 'ai_unavailable' }

  return { ok: true, draft }
}
