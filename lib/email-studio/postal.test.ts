import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLATFORM_POSTAL_LINE, postalFooterHtml } from './postal'
import { emailFooterHtml, plainTextEmail } from './shell'

// LIVE-728 (ADR-1663): every commercial Frequency email footer prints ONE postal line. The block shell and
// the plain-text renderers read it from lib/email-studio/postal.ts. A blanked or reshaped address fails here
// before a footer can go out without one.

describe('PLATFORM_POSTAL_LINE', () => {
  it('names the legal sender and a street address with a state and ZIP', () => {
    expect(PLATFORM_POSTAL_LINE.startsWith('Frequency Labs Holdings, ')).toBe(true)
    expect(PLATFORM_POSTAL_LINE).toMatch(/\d+ [^,]+, [^,]+, [A-Z]{2} \d{5}$/)
  })

  it('carries no HTML-special characters, so the plain footer can print it unescaped', () => {
    expect(PLATFORM_POSTAL_LINE).not.toMatch(/[<>&"]/)
  })
})

describe('postalFooterHtml', () => {
  it('prints the line in a footer paragraph', () => {
    const html = postalFooterHtml()
    expect(html).toContain(PLATFORM_POSTAL_LINE)
    expect(html.startsWith('<p ')).toBe(true)
  })
})

describe('one source', () => {
  it('the block shell footer prints the same line by default', () => {
    expect(emailFooterHtml()).toContain(PLATFORM_POSTAL_LINE)
  })

  it('a per-Space brand address still overrides the block shell line', () => {
    const html = emailFooterHtml({ brand: { address: '1 Main St, Oceanside, CA 92054' } })
    expect(html).toContain('1 Main St, Oceanside, CA 92054')
    expect(html).not.toContain(PLATFORM_POSTAL_LINE)
  })

  // The plain-text senders (Space campaigns and drips, Studio campaigns, nurture, automations, the agent)
  // render through plainTextEmail (EMAIL-024), whose footer is the block shell's: read the source to
  // hold each one on that seam, and the seam itself for the line.
  it.each(['lib/nurture/runner.ts', 'lib/automations.ts', 'lib/studio/agent.ts', 'lib/studio/campaigns.ts', 'lib/spaces/campaign-html.ts'])(
    '%s renders through plainTextEmail',
    (file) => {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src).toContain('plainTextEmail(')
      expect(src).not.toContain('postalFooterHtml')
    },
  )
  it('plainTextEmail prints the line after the unsubscribe link, in the html and the text part', () => {
    const { html, text } = plainTextEmail('Hello there.', { unsubscribeUrl: 'https://frequencylocal.com/u/abc' })
    expect(html).toContain(PLATFORM_POSTAL_LINE)
    expect(html.indexOf(PLATFORM_POSTAL_LINE)).toBeGreaterThan(html.indexOf('/u/abc'))
    expect(text).toContain(PLATFORM_POSTAL_LINE)
    expect(text.indexOf(PLATFORM_POSTAL_LINE)).toBeGreaterThan(text.indexOf('/u/abc'))
  })

  // Vera's two outbound shells (a human-approved send to a CRM contact, an autonomous lifecycle email to a
  // member) carry a List-Unsubscribe and a lifecycle token, so they are commercial too (SCAN-648).
  it.each(['lib/ai/vera/execute.ts', 'lib/ai/vera/autonomous-send.ts'])(
    '%s appends the postal paragraph and the plain-text postal line',
    (file) => {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src).toContain('Unsubscribe or manage emails</a>.</p>${postalFooterHtml()}</div>')
      expect(src).toContain('${unsubscribeUrl}\\n${PLATFORM_POSTAL_LINE}`')
    },
  )
})
