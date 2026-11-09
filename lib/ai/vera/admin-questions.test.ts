import { describe, expect, it } from 'vitest'
import { ADMIN_QUESTIONS, adminQuestionList, isAdminQuestion } from './admin-questions'

describe('the operator question list (LIVE-2190)', () => {
  it('knows its own ids and nothing else', () => {
    for (const id of Object.keys(ADMIN_QUESTIONS)) expect(isAdminQuestion(id)).toBe(true)
    for (const id of ['toString', 'constructor', 'members_emails', '', 7, null]) expect(isAdminQuestion(id)).toBe(false)
  })

  it('reads every id into the tool description', () => {
    const list = adminQuestionList()
    for (const id of Object.keys(ADMIN_QUESTIONS)) expect(list).toContain(`${id} (`)
  })
})
