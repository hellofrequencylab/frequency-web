// Journey editing is advice only; no model operations can enter an authoring patch.
import { runSpark } from './spark'
import { writingCoachingSpec, type WritingCoaching } from './writing-coaching'

export interface JourneyForEdit {
  title: string
  subtitle: string
  intro: string
  phases: {
    id: string
    title: string
    focus: string
    practices: { id: string; pillar: string; title: string; body: string }[]
  }[]
}

export async function planJourneyEdits(input: { request: string; journey: JourneyForEdit; profileId?: string | null }): Promise<WritingCoaching | null> {
  return runSpark(writingCoachingSpec('journey', 'journey-edit', 'opus'), { content: JSON.stringify({ request: input.request.slice(0, 1000), journey: input.journey }).slice(0, 16000), profileId: input.profileId })
}
