/** Reviewed questions only. The model selects IDs; neither action nor UI accepts generated copy. */
const QUESTIONS = {
  reader: 'Who is this passage for, and what do they need to understand first?',
  clarity: 'Which sentence could you simplify in your own words without losing a fact?',
  details: 'Which names, dates, prices or promises need checking before you publish?',
  next_step: 'What should someone be able to do after reading this passage?',
} as const
export type WebsiteCoachingPromptId = keyof typeof QUESTIONS
const FALLBACK: WebsiteCoachingPromptId[] = ['reader', 'clarity', 'next_step']
function ids(value: unknown): WebsiteCoachingPromptId[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 3 && value.every(id => typeof id === 'string' && Object.hasOwn(QUESTIONS, id)) ? [...new Set(value)] as WebsiteCoachingPromptId[] : [...FALLBACK]
}
export function websiteCoachingPromptIds(raw: string): WebsiteCoachingPromptId[] {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'promptIds')) return [...FALLBACK]
    return ids((value as { promptIds?: unknown }).promptIds)
  } catch { return [...FALLBACK] }
}
/** Client maps only reviewed IDs, even if an old/forged result carries text or questions fields. */
export function websiteCoachingQuestions(value: unknown): string[] { return ids(value).map(id => QUESTIONS[id]) }
