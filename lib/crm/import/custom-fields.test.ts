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

// ── A DATE PRINTS THE DATE IT STORES, IN EVERY ZONE (HYG-123) ────────────────────────────────────
// `formatDate` parses a date-only value at UTC midnight and then formats it. With no `timeZone` on the
// formatter that instant was rendered in the AMBIENT zone, so a stored 2026-07-16 printed as 'Jul 15,
// 2026' for every viewer west of UTC — including Pacific, where this product lives.
//
// ⚠️ WHICH CASE ACTUALLY CATCHES IT, MEASURED BY REVERTING THE FIX. The formatter is created once at
// module load, and Intl caches its resolved zone, so re-importing under a different process.env.TZ
// does NOT rebuild it: in CI (UTC) the functional cases below pass whether or not the zone is pinned,
// and only the SOURCE-SHAPE case fails. On a Pacific machine all three fail. Both are kept for that
// reason — the second is not redundant decoration, it is the half that works where CI runs.
describe('a date-only custom field is zone-proof', () => {
  const realTz = process.env.TZ
  const inZone = async (tz: string, value: string) => {
    process.env.TZ = tz
    try {
      const { formatCustomFieldValue } = await import('./custom-fields')
      return formatCustomFieldValue(value, 'date').display
    } finally {
      if (realTz === undefined) delete process.env.TZ
      else process.env.TZ = realTz
    }
  }

  it('prints the stored day in Pacific, in UTC and east of UTC alike', async () => {
    for (const tz of ['America/Los_Angeles', 'UTC', 'Pacific/Auckland']) {
      expect(await inZone(tz, '2026-07-16'), `full date in ${tz}`).toBe('Jul 16, 2026')
      expect(await inZone(tz, '--07-16'), `month-day birthday in ${tz}`).toBe('Jul 16')
      // Jan 1 is the case that also moves the YEAR when the zone leaks.
      expect(await inZone(tz, '2027-01-01'), `new year in ${tz}`).toBe('Jan 1, 2027')
    }
  })

  it('declares a timeZone on every formatter in the module, which is what makes that true', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('lib/crm/import/custom-fields.ts', 'utf8')
    const formatters = src.match(/new Intl\.DateTimeFormat\([^)]*\)/g) ?? []
    expect(formatters.length, 'the module still formats dates here').toBeGreaterThan(0)
    for (const f of formatters) expect(f, 'a formatter with no timeZone').toContain('timeZone')
  })
})
