export const WRITING_QUESTIONS = [
  'Who is this for, and what would they need to know before joining or buying?',
  'Which concrete details can you explain in your own words?',
  'What should someone expect next, and which details still need checking?',
]
export function parseWritingQuestions(raw: string): string[] | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'questions')) return null
    const questions = (value as { questions?: unknown }).questions
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 3 || questions.some(q => typeof q !== 'string' || !q.trim().endsWith('?') || q.length > 240 || /[\r\n"\u201c\u201d]/.test(q))) return null
    return [...new Set(questions.map(q => (q as string).trim()))]
  } catch { return null }
}
export function safeWritingQuestions(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [...WRITING_QUESTIONS]
  try { return parseWritingQuestions(JSON.stringify({ questions: (value as { questions?: unknown }).questions })) ?? [...WRITING_QUESTIONS] }
  catch { return [...WRITING_QUESTIONS] }
}
