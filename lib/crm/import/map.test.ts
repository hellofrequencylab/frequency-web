import { describe, it, expect } from 'vitest'
import {
  normalizeHeader,
  customFieldKey,
  diceSimilarity,
  inferValueType,
  mapColumn,
  autoMapColumns,
  headerFingerprint,
  isAutoApplied,
  AUTO_THRESHOLD,
} from './map'

describe('normalizeHeader', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeHeader('E-Mail Address')).toBe('emailaddress')
    expect(normalizeHeader('  Full_Name ')).toBe('fullname')
  })
  it('handles empty / non-alpha input', () => {
    expect(normalizeHeader('')).toBe('')
    expect(normalizeHeader('***')).toBe('')
  })
})

describe('customFieldKey', () => {
  it('snake-cases and collapses punctuation', () => {
    expect(customFieldKey('Lead Source')).toBe('lead_source')
    expect(customFieldKey('  Deal-Value ($) ')).toBe('deal_value')
  })
  it('falls back to "field" for empty', () => {
    expect(customFieldKey('!!!')).toBe('field')
  })
})

describe('diceSimilarity', () => {
  it('is 1 for identical strings', () => {
    expect(diceSimilarity('email', 'email')).toBe(1)
  })
  it('is 0 for short/degenerate input', () => {
    expect(diceSimilarity('a', 'email')).toBe(0)
  })
  it('rates near-misses higher than unrelated', () => {
    expect(diceSimilarity('emial', 'email')).toBeGreaterThan(diceSimilarity('emial', 'company'))
  })
})

describe('inferValueType', () => {
  it('detects email columns', () => {
    expect(inferValueType(['a@b.com', 'c@d.org', 'e@f.net'])).toBe('email')
  })
  it('detects phone columns', () => {
    expect(inferValueType(['(555) 123-4567', '555.987.6543', '+1 555 111 2222'])).toBe('phone')
  })
  it('detects url columns', () => {
    expect(inferValueType(['https://a.com', 'www.b.org', 'c.io/x'])).toBe('url')
  })
  it('falls back to text without a clear majority', () => {
    expect(inferValueType(['hello', 'a@b.com', 'world', 'plain'])).toBe('text')
  })
  it('is text for an empty sample', () => {
    expect(inferValueType(['', '  '])).toBe('text')
  })
  it('detects a boolean column (yes/no, true/false)', () => {
    expect(inferValueType(['yes', 'no', 'Yes', 'NO'])).toBe('boolean')
    expect(inferValueType(['TRUE', 'false', 'true'])).toBe('boolean')
  })
  it('does NOT read a mixed 0/1/other column as boolean', () => {
    expect(inferValueType(['1', '0', '7', 'many'])).not.toBe('boolean')
  })
})

describe('mapColumn', () => {
  it('maps an exact synonym with high confidence', () => {
    const m = mapColumn('Email', [{ Email: 'a@b.com' }])
    expect(m.target).toBe('email')
    expect(m.reason).toBe('synonym')
    expect(m.confidence).toBeGreaterThanOrEqual(AUTO_THRESHOLD)
  })
  it('pins near-certain when synonym AND values agree', () => {
    const m = mapColumn('Email Address', [{ 'Email Address': 'a@b.com' }, { 'Email Address': 'c@d.com' }])
    expect(m.target).toBe('email')
    expect(m.confidence).toBeGreaterThanOrEqual(0.95)
  })
  it('maps by VALUE when the header is opaque but values are emails', () => {
    const m = mapColumn('Column1', [{ Column1: 'a@b.com' }, { Column1: 'c@d.com' }])
    expect(m.target).toBe('email')
    expect(m.reason).toBe('value')
  })
  it('fuzzy-matches a misspelled header', () => {
    const m = mapColumn('Compayn', [{ Compayn: 'Acme' }])
    expect(m.target).toBe('company')
    expect(m.reason).toBe('fuzzy')
  })
  it('leaves an unknown column as a custom field', () => {
    const m = mapColumn('Lead Source', [{ 'Lead Source': 'webinar' }])
    expect(m.target).toBe('custom')
    expect(m.customKey).toBe('lead_source')
  })
})

describe('autoMapColumns', () => {
  it('maps a typical CRM export', () => {
    const headers = ['Full Name', 'E-mail', 'Phone', 'Company', 'Lead Source']
    const rows = [
      { 'Full Name': 'Sarah Kim', 'E-mail': 'sarah@x.com', Phone: '(555) 123-4567', Company: 'Acme', 'Lead Source': 'expo' },
    ]
    const map = autoMapColumns(headers, rows)
    const by = Object.fromEntries(map.map((m) => [m.header, m.target]))
    expect(by['Full Name']).toBe('displayName')
    expect(by['E-mail']).toBe('email')
    expect(by['Phone']).toBe('phone')
    expect(by['Company']).toBe('company')
    expect(by['Lead Source']).toBe('custom')
  })
  it('resolves a collision: two columns claim displayName, weaker becomes custom', () => {
    const headers = ['Name', 'Contact Name']
    const rows = [{ Name: 'Sarah', 'Contact Name': 'Sarah Kim' }]
    const map = autoMapColumns(headers, rows)
    const names = map.filter((m) => m.target === 'displayName')
    expect(names).toHaveLength(1)
    const custom = map.find((m) => m.target === 'custom')
    expect(custom).toBeDefined()
  })
  it('does NOT demote duplicate tags/notes columns', () => {
    const headers = ['Tags', 'Labels']
    const rows = [{ Tags: 'a', Labels: 'b' }]
    const map = autoMapColumns(headers, rows)
    expect(map.filter((m) => m.target === 'tags')).toHaveLength(2)
  })

  it('auto-maps a Google Contacts export (Given/Family Name, E-mail 1 - Value, Phone 1 - Value, Organization Name)', () => {
    const headers = ['Given Name', 'Family Name', 'E-mail 1 - Value', 'Phone 1 - Value', 'Organization Name']
    const rows = [
      {
        'Given Name': 'Sarah',
        'Family Name': 'Kim',
        'E-mail 1 - Value': 'sarah@x.com',
        'Phone 1 - Value': '(555) 123-4567',
        'Organization Name': 'Acme',
      },
    ]
    const by = Object.fromEntries(autoMapColumns(headers, rows).map((m) => [m.header, m.target]))
    expect(by['Given Name']).toBe('displayName')
    expect(by['Family Name']).toBe('displayName')
    expect(by['E-mail 1 - Value']).toBe('email')
    expect(by['Phone 1 - Value']).toBe('phone')
    expect(by['Organization Name']).toBe('company')
  })

  it('auto-maps an Outlook export (First/Last Name, E-mail Address, Home Phone, Company)', () => {
    const headers = ['First Name', 'Last Name', 'E-mail Address', 'Home Phone', 'Company']
    const rows = [
      { 'First Name': 'Sarah', 'Last Name': 'Kim', 'E-mail Address': 'sarah@x.com', 'Home Phone': '5551234567', Company: 'Acme' },
    ]
    const by = Object.fromEntries(autoMapColumns(headers, rows).map((m) => [m.header, m.target]))
    expect(by['First Name']).toBe('displayName')
    expect(by['Last Name']).toBe('displayName')
    expect(by['E-mail Address']).toBe('email')
    expect(by['Home Phone']).toBe('phone')
    expect(by['Company']).toBe('company')
  })

  it('name-join: keeps BOTH first/last name columns as displayName (no full-name column)', () => {
    const headers = ['First Name', 'Last Name']
    const rows = [{ 'First Name': 'Sarah', 'Last Name': 'Kim' }]
    const map = autoMapColumns(headers, rows)
    expect(map.filter((m) => m.target === 'displayName')).toHaveLength(2)
  })

  it('a single full-name column wins over name parts (parts fall back to custom)', () => {
    const headers = ['Name', 'First Name', 'Last Name']
    const rows = [{ Name: 'Sarah Kim', 'First Name': 'Sarah', 'Last Name': 'Kim' }]
    const map = autoMapColumns(headers, rows)
    expect(map.filter((m) => m.target === 'displayName')).toHaveLength(1)
    expect(map.find((m) => m.header === 'Name')?.target).toBe('displayName')
    expect(map.filter((m) => m.target === 'custom')).toHaveLength(2)
  })
})

describe('headerFingerprint', () => {
  it('is order-independent and normalized', () => {
    expect(headerFingerprint(['Email', 'Name'])).toBe(headerFingerprint(['name', 'EMAIL']))
  })
  it('differs for different header sets', () => {
    expect(headerFingerprint(['Email'])).not.toBe(headerFingerprint(['Phone']))
  })
})

describe('isAutoApplied', () => {
  it('is true for a confident named mapping', () => {
    expect(isAutoApplied({ header: 'Email', target: 'email', confidence: 0.99, reason: 'synonym', valueType: 'email' })).toBe(true)
  })
  it('is false for a custom / low-confidence mapping', () => {
    expect(isAutoApplied({ header: 'X', target: 'custom', confidence: 0, reason: 'none', valueType: 'text' })).toBe(false)
    expect(isAutoApplied({ header: 'X', target: 'company', confidence: 0.5, reason: 'fuzzy', valueType: 'text' })).toBe(false)
  })
})
