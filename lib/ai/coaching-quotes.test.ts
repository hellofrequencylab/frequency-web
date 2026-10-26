import { expect, it } from 'vitest'
import { parseWritingQuestions } from './writing-questions'
import { parseCoachingQuestions } from './space-copilot'

it('rejects questions that quote replacement copy', () => {
  expect(parseWritingQuestions(JSON.stringify({ questions: ['Would "Sunrise Flow" work as your title?'] }))).toBeNull()
  expect(parseWritingQuestions(JSON.stringify({ questions: ['Who is this for?'] }))).toEqual(['Who is this for?'])
  expect(parseCoachingQuestions(JSON.stringify(['What about “Sunrise Flow” as a title?']))).toBeNull()
  expect(parseCoachingQuestions(JSON.stringify(['Who do you welcome?']))).toBe('Who do you welcome?')
})
