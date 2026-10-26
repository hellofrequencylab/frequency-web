// Composition offers planning questions. Library selection and block creation stay manual.
import { runSpark } from './spark'
import { writingCoachingSpec, type WritingCoaching } from './writing-coaching'
export type ComposePillar = 'mind' | 'body' | 'spirit' | 'expression'
export const COMPOSE_PILLARS: ComposePillar[] = ['mind', 'body', 'spirit', 'expression']

/** A candidate library practice offered to Vera for one Pillar. Carries the shape she needs to
 *  pick well: the hook (summary), how often it's done (cadence), and how long (durationMin). */
export interface ComposeCandidate {
  id: string
  title: string
  summary: string | null
  /** How often it's done, e.g. 'Daily', '3x/week', 'Weekly'. */
  cadence?: string | null
  /** Typical session length in minutes. */
  durationMin?: number | null
}


export async function draftJourneyComposition(input: { description: string; library: Record<ComposePillar, ComposeCandidate[]>; profileId?: string | null; priorWeekSummary?: string; anchorTitle?: string }): Promise<WritingCoaching | null> {
  return runSpark(writingCoachingSpec('journey', 'journey-composition', 'opus'), { content: JSON.stringify(input).slice(0, 16000), profileId: input.profileId })
}
