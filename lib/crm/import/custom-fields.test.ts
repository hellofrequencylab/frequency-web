import { describe, it, expect, afterAll, vi } from 'vitest'
import { humanizeFieldKey, formatCustomFieldValue } from './custom-fields'

// LIVE-531. These date cases are the ONLY ones in this file that depend on the ambient zone, and CI
// runs UTC — the zone in which the defect cannot exist. So the suite sets TZ itself rather than
// trusting the runner: without this, a formatter that lost `timeZone: 'UTC'` stays green in CI and
// prints the wrong day on every non-UTC runtime (the LIVE-377 lesson, applied here).
// Pacific is chosen because it is west of UTC, so UTC midnight falls on the PREVIOUS local day.
const ORIGINAL_TZ = process.env.TZ

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

/**
 * LIVE-531 — A STORED DATE MUST PRINT THE DAY IT STORES, IN EVERY ZONE.
 *
 * This block forces TZ to Pacific ITSELF. CI runs UTC, where UTC midnight is already the right day
 * and the defect is invisible, so a suite that trusted the runner would never see a regression here.
 *
 * The formatters are MODULE-LEVEL constants, built once at import. Setting TZ in a hook would be too
 * late — the formatter already exists, carrying the zone it was born with. So each case resets the
 * module registry and re-imports under the forced zone, which is the only way the ambient zone can
 * reach the constructor the way it does in a real non-UTC runtime.
 */
describe('formatCustomFieldValue — a date is a day, not an instant (LIVE-531)', () => {
  const PACIFIC = 'America/Los_Angeles'

  /** Re-import the module with TZ forced, so the module-level Intl formatters are built in `zone`. */
  async function loadIn(zone: string) {
    process.env.TZ = zone
    vi.resetModules()
    return await import('./custom-fields')
  }

  afterAll(() => {
    process.env.TZ = ORIGINAL_TZ
    vi.resetModules()
  })

  it('prints the stored day west of UTC, where UTC midnight is the previous local day', async () => {
    const { formatCustomFieldValue: fmt } = await loadIn(PACIFIC)
    // Guard the guard: if the forced zone did not take, this test proves nothing.
    expect(new Intl.DateTimeFormat('en-US').resolvedOptions().timeZone).toBe(PACIFIC)
    // Unpinned, UTC midnight on 2026-07-16 is 2026-07-15 17:00 here and this reads 'Jul 15, 2026'.
    expect(fmt('2026-07-16', 'date').display).toBe('Jul 16, 2026')
  })

  it('prints the stored day for a year-less vCard birthday too, the branch with its own formatter', async () => {
    const { formatCustomFieldValue: fmt } = await loadIn(PACIFIC)
    expect(fmt('--07-16', 'date').display).toBe('Jul 16')
  })

  it('reads a January 1 date as January 1, not the previous December 31', async () => {
    const { formatCustomFieldValue: fmt } = await loadIn(PACIFIC)
    // The year rolls back too, not just the day, so this pins the worst-looking case.
    expect(fmt('2026-01-01', 'date').display).toBe('Jan 1, 2026')
    expect(fmt('--01-01', 'date').display).toBe('Jan 1')
  })

  it('agrees with UTC: the same stored value prints the same day in both zones', async () => {
    const pacific = await loadIn(PACIFIC)
    const utc = await loadIn('UTC')
    for (const stored of ['2026-07-16', '2026-01-01', '2026-12-31', '--07-16', '--01-01']) {
      expect(pacific.formatCustomFieldValue(stored, 'date').display).toBe(
        utc.formatCustomFieldValue(stored, 'date').display,
      )
    }
  })

  it('prints the stored day east of UTC as well, so the pin is a zone-independent one', async () => {
    const { formatCustomFieldValue: fmt } = await loadIn('Asia/Tokyo')
    // Tokyo is ahead of UTC, so an unpinned formatter happens to be right here. Pinned, it stays right.
    expect(fmt('2026-07-16', 'date').display).toBe('Jul 16, 2026')
    expect(fmt('--07-16', 'date').display).toBe('Jul 16')
  })

  it('still passes a non-date value through untouched under a shifted zone', async () => {
    const { formatCustomFieldValue: fmt } = await loadIn(PACIFIC)
    expect(fmt('not a date', 'date').display).toBe('not a date')
    expect(fmt('', 'date').display).toBe('')
  })
})
