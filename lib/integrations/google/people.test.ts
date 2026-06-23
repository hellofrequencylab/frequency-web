import { describe, it, expect } from 'vitest'
import { normalizePerson } from './people'

describe('normalizePerson', () => {
  it('prefers the primary entry for each field', () => {
    const n = normalizePerson({
      names: [{ displayName: 'Secondary' }, { displayName: 'Primary Name', metadata: { primary: true } }],
      emailAddresses: [
        { value: 'second@example.com' },
        { value: 'PRIMARY@Example.com', metadata: { primary: true } },
      ],
      phoneNumbers: [{ value: '111' }, { value: '+1 (555) 222-3333', metadata: { primary: true } }],
      organizations: [{ name: 'Acme', title: 'Lead', metadata: { primary: true } }],
      urls: [{ value: 'https://acme.test', metadata: { primary: true } }],
      addresses: [{ city: 'Austin', metadata: { primary: true } }],
    })
    expect(n).toEqual({
      displayName: 'Primary Name',
      email: 'primary@example.com', // lowercased + trimmed
      phone: '+1 (555) 222-3333',
      title: 'Lead',
      company: 'Acme',
      city: 'Austin',
      website: 'https://acme.test',
    })
  })

  it('falls back to the first entry when none is flagged primary', () => {
    const n = normalizePerson({
      names: [{ displayName: 'First' }, { displayName: 'Second' }],
      emailAddresses: [{ value: 'first@example.com' }],
    })
    expect(n?.displayName).toBe('First')
    expect(n?.email).toBe('first@example.com')
  })

  it('returns null when there is no name, email, or phone', () => {
    expect(normalizePerson({ organizations: [{ name: 'Ghost Co' }] })).toBeNull()
    expect(normalizePerson({})).toBeNull()
  })

  it('keeps a contact that has only a phone', () => {
    const n = normalizePerson({ phoneNumbers: [{ value: '555-0100' }] })
    expect(n).not.toBeNull()
    expect(n?.phone).toBe('555-0100')
    expect(n?.displayName).toBeNull()
    expect(n?.email).toBeNull()
  })

  it('treats blank strings as missing', () => {
    expect(normalizePerson({ names: [{ displayName: '   ' }] })).toBeNull()
  })
})
