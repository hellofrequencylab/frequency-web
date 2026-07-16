import { describe, it, expect } from 'vitest'
import { humanizeFieldKey, formatCustomFieldValue } from './custom-fields'

describe('humanizeFieldKey', () => {
  it('turns a snake key into a sentence label', () => {
    expect(humanizeFieldKey('lead_source')).toBe('Lead source')
    expect(humanizeFieldKey('deal_value')).toBe('Deal value')
  })
})

describe('formatCustomFieldValue', () => {
  it('renders a phone as a tel link with a clean href', () => {
    const d = formatCustomFieldValue('+1 (555) 123-4567', 'phone')
    expect(d.kind).toBe('tel')
    expect(d.href).toBe('tel:+15551234567')
  })
  it('renders an email as a mailto link', () => {
    expect(formatCustomFieldValue('a@x.com', 'email')).toMatchObject({ kind: 'mailto', href: 'mailto:a@x.com' })
  })
  it('renders a bare url with an https href', () => {
    expect(formatCustomFieldValue('acme.com', 'url')).toMatchObject({ kind: 'link', href: 'https://acme.com' })
  })
  it('formats an ISO date and a vCard month-day birthday', () => {
    expect(formatCustomFieldValue('2026-07-16', 'date').display).toBe('Jul 16, 2026')
    expect(formatCustomFieldValue('--07-16', 'date').display).toBe('Jul 16')
  })
  it('reads a boolean as Yes/No', () => {
    expect(formatCustomFieldValue('TRUE', 'boolean').display).toBe('Yes')
    expect(formatCustomFieldValue('no', 'boolean').display).toBe('No')
  })
  it('falls back to plain text for an unknown type or value', () => {
    expect(formatCustomFieldValue('webinar', 'text')).toMatchObject({ kind: 'text', display: 'webinar' })
    expect(formatCustomFieldValue('not a date', 'date').display).toBe('not a date')
  })
})
