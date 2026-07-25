import { describe, it, expect } from 'vitest'
import { cleanConversationBody } from './message-body'

describe('cleanConversationBody', () => {
  it('strips our unsubscribe/manage-emails footer, keeping the sign-off above the rule', () => {
    const raw =
      "Hey Bro\n\nSometimes we all get emails.\n\nFrequency Collective\n\n---\nUnsubscribe: https://frequencylocal.com/unsubscribe?p=abc&c=lifecycle&t=xyz\nManage emails: https://frequencylocal.com/manage-emails?p=abc&c=lifecycle&t=xyz"
    const out = cleanConversationBody(raw)
    expect(out).toBe('Hey Bro\n\nSometimes we all get emails.\n\nFrequency Collective')
    expect(out).not.toMatch(/unsubscribe/i)
    expect(out).not.toContain('http')
  })

  it('cuts quoted reply history at the "On ... wrote:" attribution', () => {
    const raw =
      "Yes, that works for me!\n\nOn Fri, Jul 24, 2026 at 9:30 PM Daniel <d@x.com> wrote:\n> Are you free Tuesday?\n> Let me know."
    expect(cleanConversationBody(raw)).toBe('Yes, that works for me!')
  })

  it('cuts an Outlook-style Original Message divider', () => {
    const raw = 'Sounds good.\n\n----- Original Message -----\nFrom: someone\nblah'
    expect(cleanConversationBody(raw)).toBe('Sounds good.')
  })

  it('drops stray footer link lines even without a separator', () => {
    const raw = 'Quick note.\nUnsubscribe: https://frequencylocal.com/unsubscribe?p=1\nBye'
    expect(cleanConversationBody(raw)).toBe('Quick note.\nBye')
  })

  it('leaves a clean human message untouched', () => {
    const raw = 'Hi there,\n\nThanks for reaching out. Talk soon.'
    expect(cleanConversationBody(raw)).toBe(raw)
  })

  it('never blanks a message that is entirely a quote (falls back to the original)', () => {
    const raw = 'On Mon, someone wrote:\n> everything was quoted'
    expect(cleanConversationBody(raw).length).toBeGreaterThan(0)
  })

  it('is fail-safe on empty / null input', () => {
    expect(cleanConversationBody('')).toBe('')
    expect(cleanConversationBody(null)).toBe('')
    expect(cleanConversationBody(undefined)).toBe('')
  })
})
