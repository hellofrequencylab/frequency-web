// Historical API name. Planning returns questions, never replacement fields.
import { runSpark } from './spark'
import { writingCoachingSpec, type WritingCoaching } from './writing-coaching'
const PRACTICE_EDIT = writingCoachingSpec('practice', 'practice-edit', 'opus')
export async function planPracticeEdits(input: { request: string; practice: { title: string; summary: string; description: string; body: string; cadence: string }; profileId?: string | null }): Promise<WritingCoaching | null> {
  if (!input.request.trim()) return null
  return runSpark(PRACTICE_EDIT, { content: JSON.stringify({ request: input.request.slice(0, 1000), practice: { ...input.practice, body: input.practice.body.slice(0, 8000) } }), profileId: input.profileId })
}
