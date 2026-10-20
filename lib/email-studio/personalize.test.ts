import { describe, expect, it } from 'vitest'
import { personalizeFor, splitDisplayName } from './personalize'

const parts = { subject: 'Hi {{ contact.first_name | "there" }}', html: '<p>Hi {{ contact.first_name | "there" }}, from {{ contact.email }}</p>' }

describe('personalizeFor', () => {
  it('fills the recipient first name and email', () => {
    expect(personalizeFor(parts, { email: 'maya@example.com', firstName: 'Maya' })).toEqual({
      subject: 'Hi Maya',
      html: '<p>Hi Maya, from maya@example.com</p>',
    })
  })
  it('falls back for a nameless recipient', () => {
    expect(personalizeFor(parts, { email: 'x@example.com' }).subject).toBe('Hi there')
  })
  it('escapes a name in the html but not in the subject', () => {
    const out = personalizeFor(parts, { email: 'x@example.com', firstName: 'A<b>' })
    expect(out.html).toContain('A&lt;b&gt;')
    expect(out.subject).toBe('Hi A<b>')
  })
})

describe('splitDisplayName', () => {
  it('takes the first word as the first name', () => {
    expect(splitDisplayName('  Maya Lin Chen ')).toEqual({ firstName: 'Maya', lastName: 'Lin Chen' })
    expect(splitDisplayName(null)).toEqual({ firstName: '', lastName: '' })
  })
})
