import { describe, expect, it } from 'vitest'
import { firstNameOf, isWelcomePending, welcomeDraftLayout, welcomeSubject } from './welcome'

describe('isWelcomePending', () => {
  it('glows for every member with no welcome on record, and clears once welcomed', () => {
    expect(isWelcomePending(false)).toBe(true)
    expect(isWelcomePending(true)).toBe(false)
  })
})

describe('firstNameOf', () => {
  it('takes the first word of a real name', () => {
    expect(firstNameOf('Maya Lopez', 'maya')).toBe('Maya')
  })
  it('refuses emails, handles and blanks', () => {
    expect(firstNameOf('maya@example.com')).toBeNull()
    expect(firstNameOf('mayal', 'mayal')).toBeNull()
    expect(firstNameOf('  ')).toBeNull()
    expect(firstNameOf(null)).toBeNull()
  })
})

describe('the welcome draft', () => {
  it('greets by name and signs off as the sender, with no em dashes and no ask', () => {
    const layout = welcomeDraftLayout('Maya', 'Daniel')
    const heading = String(layout.content?.heading?.text)
    const body = String(layout.content?.text?.text)
    expect(heading).toBe('Hey Maya, welcome in')
    expect(body).toContain("I'm Daniel")
    expect(body).toMatch(/Daniel$/)
    expect(`${heading}${body}`).not.toMatch(/[—–]/)
    expect(body).not.toMatch(/sign up|subscribe|buy|upgrade|book a call/i)
    expect(welcomeSubject('Maya')).toBe('Welcome to Frequency, Maya')
  })
  it('reads naturally with no names and escapes a sender name', () => {
    const layout = welcomeDraftLayout(null, null)
    expect(layout.content?.heading?.text).toBe('Hey, welcome in')
    expect(welcomeSubject(null)).toBe('Welcome to Frequency')
    const sneaky = welcomeDraftLayout('Maya', '<b>x')
    expect(String(sneaky.content?.text?.text)).not.toContain('<b>x')
  })
})
