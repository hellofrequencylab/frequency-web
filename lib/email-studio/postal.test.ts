import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLATFORM_POSTAL_LINE, postalFooterHtml } from './postal'
import { emailFooterHtml } from './shell'

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

  // These three render their footer in a module-private template; read the source instead of exporting a
  // helper only a test would name.
  it.each(['lib/nurture/runner.ts', 'lib/automations.ts', 'lib/studio/agent.ts'])(
    '%s appends the postal paragraph after its unsubscribe link',
    (file) => {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src).toContain('Unsubscribe</a>.</p>${postalFooterHtml()}</div>')
      expect(src).not.toContain('Unsubscribe</a>.</p></div>')
    },
  )
})
