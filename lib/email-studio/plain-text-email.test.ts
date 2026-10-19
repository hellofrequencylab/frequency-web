import { describe, it, expect } from 'vitest'
import { plainTextEmail } from './shell'
import { DEFAULT_EMAIL_COLORS } from './render'
import { PLATFORM_POSTAL_LINE } from './postal'

// EMAIL-024: the one render for a plain-text body. Seven senders (Space campaigns, the scheduled and drip
// crons, the event broadcast, Studio campaigns, nurture, automations, the agent) used to each hand-roll a
// `#333` template with no doctype, wordmark or address line. What is pinned: the body is escaped and split
// into paragraphs, the shell and the footer are the block shell's, a Space brand recolours it, a free
// Space's send says so, and the text part carries the body, the unsubscribe URL and the postal line.

describe('plainTextEmail', () => {
  it('wraps escaped paragraphs in the full shell with the unsubscribe footer', () => {
    const { html } = plainTextEmail('Hi <there> & friends.\nSecond line.\n\nSee you Saturday.', { unsubscribeUrl: 'https://x/u/1' })
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('Hi &lt;there&gt; &amp; friends.<br>Second line.</p>')
    expect(html).toContain('>See you Saturday.</p>')
    expect(html).not.toContain('<there>')
    expect(html).toContain(`color:${DEFAULT_EMAIL_COLORS.text}`)
    expect(html).toContain('href="https://x/u/1"')
    expect(html).toContain(PLATFORM_POSTAL_LINE)
    expect(html).toContain('Frequency')
  })

  it('says why the reader got it, under the body', () => {
    const { html } = plainTextEmail('Body.', { audienceLine: 'You are receiving this as a Frequency member.' })
    expect(html.indexOf('You are receiving this as a Frequency member.')).toBeGreaterThan(html.indexOf('>Body.</p>'))
  })

  it('wears a Space brand: its wordmark and its palette, and the free-plan line when asked', () => {
    const colors = { ...DEFAULT_EMAIL_COLORS, text: '#102030', primary: '#405060' } // token-ok: a test brand
    const { html, text } = plainTextEmail('Body.', { brand: { wordmark: 'River Studio', colors }, sentWithFrequency: true })
    expect(html).toContain('River Studio')
    expect(html).toContain('color:#102030')
    expect(html).toContain('Sent with <a')
    expect(text).toContain('Sent with Frequency.')
  })

  it('the text part carries the body, the unsubscribe URL and the postal line, in that order', () => {
    const { text } = plainTextEmail('Hello.\n\nBye.', { unsubscribeUrl: 'https://x/u/1' })
    expect(text.startsWith('Hello.\n\nBye.')).toBe(true)
    expect(text.indexOf('Unsubscribe: https://x/u/1')).toBeGreaterThan(text.indexOf('Bye.'))
    expect(text.indexOf(PLATFORM_POSTAL_LINE)).toBeGreaterThan(text.indexOf('Unsubscribe:'))
  })

  it('an empty body still carries the footer (the footer never depends on the body)', () => {
    expect(plainTextEmail('').html).toContain(PLATFORM_POSTAL_LINE)
  })
})
