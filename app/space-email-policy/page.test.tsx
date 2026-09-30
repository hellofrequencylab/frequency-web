import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import SpaceEmailPolicyPage, { metadata } from './page'
import { SPACE_FUNCTIONS } from '@/lib/spaces/functions'

// THE SPACE EMAIL AUP IS LIVE POLICY, AND IT SAYS WHAT THE CODE DOES (LIVE-729, ADR-1673; drafted by
// LIVE-707, ADR-1658).
//
// Owner ruling on OWN-085, 2026-09-30: "Ship without counsel review". So the page is Frequency's
// policy: indexed and in the sitemap like /privacy and /terms, dated, linked from the Turn on email
// card and the Terms, and carrying none of the draft framing (no draft banner, no questions for
// counsel, no bracketed placeholder). The second block pins the other way it goes wrong: a policy
// that says 500 a day while the backbone sends 1,000 is worse than no policy, so the numbers and the
// default sender role are read from the modules that enforce them.

// FocusTemplate's page admin bar reads the pathname; outside a Next request there is none.
vi.mock('next/navigation', () => ({ usePathname: () => '/space-email-policy' }))

const ROUTE = '/space-email-policy'

const html = renderToStaticMarkup(SpaceEmailPolicyPage())
const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, ' ')

/** Source with comments removed, so a comment that names the route is not mistaken for a link. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
}

describe("Space email AUP: live policy, presented as Frequency's", () => {
  it('asks to be indexed and is in the sitemap, like /privacy and /terms', () => {
    expect(metadata.robots).toEqual({ index: true, follow: true })
    expect(code('app/sitemap.ts')).toContain('`${SITE_URL}/space-email-policy`')
  })

  it('is dated, and carries none of the draft framing', () => {
    expect(text).toContain('Last updated: September 30, 2026')
    expect(text).toContain('1. What this covers')
    for (const draft of [/draft/i, /counsel/i, /not in force/i, /\[owner/i, /no lawyer/i]) {
      expect(text).not.toMatch(draft)
      expect(String(metadata.title)).not.toMatch(draft)
      expect(String(metadata.description)).not.toMatch(draft)
    }
  })

  it('is linked from the Turn on email card and from the Terms', () => {
    expect(code('components/spaces/email/email-enable-card.tsx')).toContain(`'${ROUTE}'`)
    expect(code('app/terms/page.tsx')).toContain(`href="${ROUTE}"`)
  })

  it('has no em or en dash (CONTENT-VOICE)', () => {
    expect(text).not.toMatch(/[–—]/)
  })
})

describe('Space email AUP: every number is the one the code enforces', () => {
  it('states the daily cap lib/spaces/email.ts enforces', () => {
    const m = /export const DAILY_SEND_CAP = ([\d_]+)/.exec(readFileSync('lib/spaces/email.ts', 'utf8'))
    expect(m).not.toBeNull()
    const cap = Number(m![1].replace(/_/g, ''))
    expect(text).toContain(`up to ${cap.toLocaleString('en-US')} emails a day, counted from midnight UTC`)
  })

  it('states the complaint line the Email panel warns at', () => {
    const m = /const COMPLAINT_CEILING = ([\d.]+)/.exec(
      readFileSync('components/spaces/email/analytics-panel.tsx', 'utf8'),
    )
    expect(m).not.toBeNull()
    const pct = `${Number(m![1]) * 100}%`
    expect(text).toContain(`spam complaints go above ${pct}`)
  })

  it('names the default sender roles the email function grants', () => {
    const email = SPACE_FUNCTIONS.find((f) => f.key === 'email')
    expect(email?.defaultMinRole).toBe('admin')
    expect(text).toContain("By default that is the Space's owner or an admin")
  })

  it('says every email carries a postal address, which the shared footer line prints', () => {
    expect(readFileSync('lib/email-studio/postal.ts', 'utf8')).toMatch(/export const PLATFORM_POSTAL_LINE\b/)
    expect(text).toContain("Every email ends with Frequency Labs Holdings' postal address.")
  })

  it('says a suspended Space sends nothing, which the send backbone enforces', () => {
    expect(readFileSync('lib/spaces/email.ts', 'utf8')).toMatch(/export function spaceEmailHold\(/)
    expect(text).toContain('A suspended Space sends no email at all.')
  })

  it('says an import is not permission, which is what the import path writes', () => {
    expect(readFileSync('lib/crm/import/commit.ts', 'utf8')).toMatch(/consent_state: 'unknown'/)
    expect(text).toContain('Contacts you import start as not opted in')
  })
})
