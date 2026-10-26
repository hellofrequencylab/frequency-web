// Practice creation and template claiming return separate coaching questions only.
import type { SeedMood } from '@/lib/studio/kernel/moods'
import { runSpark } from './spark'
import { writingCoachingSpec, type WritingCoaching } from './writing-coaching'

export type PracticePace = 'light' | 'medium'

export interface PracticeSparkAnswers {
  /** Who the Practice is for. */
  who: string
  /** What the act is — the concrete thing you do. */
  act: string
  /** What people walk away with after doing it for a week. */
  outcome: string
  /** Roughly how often it's done. */
  cadence: PracticeCadenceHint
  /** Roughly how much time one session takes. */
  pace: PracticePace
  /** The MOOD dial (ADR-986): steers TONE only. It never changes what is true, just how it reads. */
  mood?: SeedMood
}

/** The cadence options the wizard offers, kept tight so they line up with the builder's select. */
export type PracticeCadenceHint = 'daily' | 'few-times-week' | 'weekly'

export const CADENCE_LABEL: Record<PracticeCadenceHint, string> = {
  daily: 'Daily',
  'few-times-week': 'A few times a week',
  weekly: 'Weekly',
}

/** Manual Practice timer configuration. Existing server sanitizers validate every field
 * before storage; coaching never supplies timer settings. */
export interface PracticeSparkTimer {
  /** 'mindless' (Be Still), 'movement' (Get Moving), or 'none' (Just Log a real-world act). */
  timerKind: 'mindless' | 'movement' | 'none'
  /** The Be Still flavour, when timerKind is 'mindless'. */
  mindlessMode: 'meditate' | 'breathe' | 'journal' | 'stillness' | 'ritual' | null
  /** The breath pattern slug, when mindlessMode is 'breathe'. */
  breathPattern: 'box' | 'cohere' | 'triangle' | '3x' | '478' | null
  /** The Get Moving shape, when timerKind is 'movement'. */
  movementMode: 'walk' | 'run' | 'yoga' | 'strength' | 'stretch' | null
  /** A short creator warm-up line shown in the pre-roll (<= 140 chars), or null. */
  warmupMessage: string | null
}

export type PracticeSpark = WritingCoaching
export type PracticeSuggestion = WritingCoaching
export const PRACTICE_SPARK = writingCoachingSpec('practice', 'practice-spark', 'sonnet')
export const PRACTICE_CLAIM = writingCoachingSpec('practice', 'practice-claim', 'haiku')

export async function draftPracticeSpark(input: PracticeSparkAnswers & { profileId?: string | null; sourceText?: string | null }): Promise<PracticeSpark | null> {
  return runSpark(PRACTICE_SPARK, { content: JSON.stringify({ who: input.who?.slice(0, 400), act: input.act?.slice(0, 1000), outcome: input.outcome?.slice(0, 400), cadence: input.cadence, pace: input.pace, authoredDraft: input.sourceText?.slice(0, 8000) }), profileId: input.profileId })
}

export async function personalizePractice(input: { template: { title: string; summary: string | null; body: string | null; cadence: string | null }; goal: string; schedule: string; profileId?: string | null }): Promise<PracticeSuggestion | null> {
  if (!input.goal.trim()) return null
  return runSpark(PRACTICE_CLAIM, { content: JSON.stringify({ template: { ...input.template, body: input.template.body?.slice(0, 8000) }, goal: input.goal.slice(0, 1000), schedule: input.schedule.slice(0, 300) }), profileId: input.profileId })
}
