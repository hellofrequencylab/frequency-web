import { COACHING_QUESTION_CATALOG, selectCoachingQuestions } from './coaching-question-catalog'
export const WRITING_QUESTIONS = [
  'Who is this for, and what would they need to know before joining or buying?',
  'Which concrete details can you explain in your own words?',
  'What should someone expect next, and which details still need checking?',
]
export function parseWritingQuestions(raw: string): string[] | null {
  try {
    const value: unknown = JSON.parse(raw)
    const selected = selectCoachingQuestions(value, 3)
    if (selected) return selected
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'questions')) return null
    const questions = (value as { questions?: unknown }).questions
    const reviewed: readonly string[] = Object.values(COACHING_QUESTION_CATALOG)
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 3 || questions.some(q => typeof q !== 'string' || !reviewed.includes(q))) return null
    return [...new Set(questions.map(q => (q as string).trim()))]
  } catch { return null }
}
export function safeWritingQuestions(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [...WRITING_QUESTIONS]
  try { return parseWritingQuestions(JSON.stringify({ questions: (value as { questions?: unknown }).questions })) ?? [...WRITING_QUESTIONS] }
  catch { return [...WRITING_QUESTIONS] }
}
