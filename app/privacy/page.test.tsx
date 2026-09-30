import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PrivacyPage from './page'

// FocusTemplate mounts the page admin bar, which reads the pathname; outside the App Router there
// is none, so the test supplies this page's own.
vi.mock('next/navigation', () => ({
  usePathname: () => '/privacy',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))

// ── The privacy policy says what the product does (LIVE-724, ADR-1642) ───────────────────────────
//
// Until 2026-09-29 the policy told members to email for a data export or an account deletion,
// though both are self-serve in Settings, Account and privacy, and it named five of the vendors the
// code sends member data to. These pin the rendered page, not the source: the rights paragraphs link
// the real section, no paragraph sends an export or a deletion to email, and each processor is named.
// The backlog probe for LIVE-724 derives the processor list from the code itself.

const html = renderToStaticMarkup(<PrivacyPage />)
const paragraphs = html.split('<p').slice(1)

describe('privacy policy', () => {
  it('links the self-serve download and delete section of Settings', () => {
    const toAccount = html.match(/href="\/settings#account"/g) ?? []
    expect(toAccount.length).toBeGreaterThanOrEqual(2)
    expect(html).toContain('Download my data')
    expect(html).toContain('Delete account')
  })

  it('never sends an export or a deletion to email', () => {
    const emailed = paragraphs.filter((p) => p.includes('hello@frequencylocal.com') && /export|delet/i.test(p))
    expect(emailed).toEqual([])
  })

  it('names every processor that receives member data', () => {
    for (const name of [
      'Supabase', 'Vercel', 'Anthropic', 'Sentry', 'Twilio', 'Resend', 'Stripe', 'Upstash',
      'Google', 'OpenFreeMap', 'Photon', 'Nominatim', 'ipapi.co', 'Recraft',
    ]) {
      expect(html, name).toContain(name)
    }
  })

  it('covers push, location and the camera, with the new date and no em dash', () => {
    expect(html).toMatch(/push notifications/i)
    expect(html).toMatch(/live location/i)
    expect(html).toMatch(/camera/i)
    expect(html).toContain('Last updated: September 29, 2026')
    expect(html).not.toContain('—')
  })

  it('does not call Google Analytics anonymized, since server events carry the account ID', () => {
    expect(html).not.toMatch(/anonymized usage/i)
    expect(html.match(/with your account ID, never your name or email/g)?.length).toBe(2)
  })
})
