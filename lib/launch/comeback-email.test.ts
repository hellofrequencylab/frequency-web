import { describe, expect, it } from 'vitest'
import { buildComebackEmail, comebackClock } from './comeback-email'
import { COMEBACK_KINDS } from './comeback'

const base = {
  to: 'sam@example.com',
  firstName: 'Sam',
  clock: comebackClock(4 * 60 * 1000 + 18_000),
  made: ['Spotlight', 'Your Space'],
  nextLabel: 'Website',
  baseUrl: 'https://frequencylocal.com',
  unsubscribeUrl: 'https://frequencylocal.com/unsubscribe?p=p1&c=lifecycle&t=tok',
}

describe('comebackClock', () => {
  it('shows what is left of the twelve minutes as m:ss', () => {
    expect(comebackClock(0)).toEqual({ label: '12:00', bonus: false })
    expect(comebackClock(4 * 60 * 1000 + 18_000)).toEqual({ label: '7:42', bonus: false })
    expect(comebackClock(11 * 60 * 1000 + 59_500)).toEqual({ label: '0:01', bonus: false })
  })

  it('reads bonus time once the twelve minutes are used', () => {
    expect(comebackClock(12 * 60 * 1000)).toEqual({ label: '0:00', bonus: true })
    expect(comebackClock(20 * 60 * 1000)).toEqual({ label: '0:00', bonus: true })
  })

  it('returns null rather than guess when the column is missing or junk', () => {
    for (const v of [null, undefined, 'x', -5, NaN, Infinity]) expect(comebackClock(v)).toBeNull()
  })
})

describe('buildComebackEmail', () => {
  for (const kind of COMEBACK_KINDS) {
    it(`${kind}: warm plain copy, the time left, one button to /launch/resume, an unsubscribe`, () => {
      const e = buildComebackEmail({ kind, ...base })
      expect(e.to).toBe('sam@example.com')
      expect(`${e.subject} ${e.html} ${e.text}`).not.toMatch(/[—–]/)
      expect(e.subject).not.toMatch(/[!]/)
      expect(e.html).toContain('7:42')
      expect(e.text).toContain('7:42')
      expect(e.html).toContain('href="https://frequencylocal.com/launch/resume"')
      expect(e.text).toContain('https://frequencylocal.com/launch/resume')
      expect(e.html).toContain('Spotlight, Your Space')
      expect(e.html).toContain('Next up is Website.')
      expect(e.html).toMatch(/unsubscribe/i)
      expect(e.text).toContain(base.unsubscribeUrl)
      expect(e.html).toContain('Hi Sam,')
    })
  }

  it('carries the launch id to /launch/resume, never the bare /launch a signed-out visitor is hopped away from (LIVE-2330)', () => {
    const lid = '3F2B8C1E-9A4D-4E6F-8B7A-1C2D3E4F5A6B'
    const e = buildComebackEmail({ kind: 'comeback_1d', ...base, baseUrl: 'https://frequencylocal.com/', launchId: lid })
    const href = `https://frequencylocal.com/launch/resume?lid=${lid.toLowerCase()}`
    expect(e.html).toContain(`href="${href}"`)
    expect(e.text).toContain(href)
    expect(e.html).not.toContain('href="https://frequencylocal.com/launch"')
    expect(buildComebackEmail({ kind: 'comeback_1d', ...base, launchId: 'x"><b>' }).html).toContain('href="https://frequencylocal.com/launch/resume"')
  })

  it('says Publish nowhere it should not, and never mentions photos', () => {
    for (const kind of COMEBACK_KINDS) {
      const e = buildComebackEmail({ kind, ...base })
      expect(e.html.toLowerCase()).not.toContain('photo')
      expect(e.html).not.toMatch(/\b(hurry|last chance|expires|don't miss|only \d)/i)
    }
  })

  it('the last email says it is the last, and the others do not promise silence', () => {
    expect(buildComebackEmail({ kind: 'comeback_3d', ...base }).text).toMatch(/last one|won't email you about it again/)
    expect(buildComebackEmail({ kind: 'comeback_1h', ...base }).text).not.toMatch(/last one/)
  })

  it('reads bonus time warmly and shows no countdown', () => {
    const e = buildComebackEmail({ kind: 'comeback_1d', ...base, clock: comebackClock(15 * 60 * 1000) })
    expect(e.text).toContain('bonus time')
    expect(e.html).not.toContain('0:00')
  })

  it('leaves the time out when the clock is unknown, and the greeting plain without a name', () => {
    const e = buildComebackEmail({ kind: 'comeback_1h', ...base, clock: null, firstName: null, made: [], nextLabel: null })
    expect(e.html).not.toMatch(/\d:\d\d/)
    expect(e.html).toContain('Hi,')
    expect(e.text).not.toContain('So far')
    expect(e.text).not.toContain('Next up')
  })

  it('escapes a name', () => {
    const e = buildComebackEmail({ kind: 'comeback_1h', ...base, firstName: '<b>Sam</b>' })
    expect(e.html).not.toContain('<b>Sam</b>')
    expect(e.html).toContain('&lt;b&gt;')
  })
})
