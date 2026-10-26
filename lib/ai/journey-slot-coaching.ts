// Questions for the author, never a participant-facing prompt to save.
import { runSpark } from './spark'
import { writingCoachingSpec, type WritingCoaching } from './writing-coaching'
export async function draftSlotCoaching(input: {
  journeyTitle: string
  practiceTitle: string
  /** The slot's Pillar name(s) (Mind/Body/Spirit/Expression), if known. */
  pillars?: string[]
  /** The current season's name + theme, if a season is live. */
  season?: { name: string; theme?: string | null } | null
  profileId?: string | null
}): Promise<WritingCoaching | null> {
  return runSpark(writingCoachingSpec('journey', 'journey-slot-coaching', 'haiku'), { content: JSON.stringify(input).slice(0, 4000), profileId: input.profileId })
}
