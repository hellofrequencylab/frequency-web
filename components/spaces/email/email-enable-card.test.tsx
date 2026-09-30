import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// THE TURN ON EMAIL CARD LINKS THE LIVE SPACE EMAIL POLICY (LIVE-729, ADR-1673).
//
// Owner ruling on OWN-085, 2026-09-30: "Ship without counsel review". The policy at
// /space-email-policy is live, so the card an owner sees before email is on links it. Linking it adds
// no consent step: the one acknowledgment checkbox is still the only thing the owner confirms, with
// the same words, and the button still waits on it.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/lib/spaces/campaigns-actions', () => ({
  setSpaceEmailEnabled: vi.fn(async () => ({ ok: true })),
}))

const { EmailEnableCard } = await import('./email-enable-card')

const html = renderToStaticMarkup(<EmailEnableCard spaceId="space-1" slug="the-lab" />)

describe('EmailEnableCard', () => {
  it('links the Space email policy, opening it beside the card', () => {
    const link = /<a [^>]*href="\/space-email-policy"[^>]*>([^<]*)<\/a>/.exec(html)
    expect(link).not.toBeNull()
    expect(link![1]).toBe('Space email policy')
    expect(link![0]).toContain('target="_blank"')
    expect(link![0]).toContain('rel="noopener noreferrer"')
  })

  it('keeps the one acknowledgment checkbox as the only thing the owner confirms', () => {
    expect(html.match(/type="checkbox"/g) ?? []).toHaveLength(1)
    expect(html).toContain('I have permission to email these people and will follow anti-spam rules.')
    // Nothing is ticked yet, so Turn on email waits on the acknowledgment.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Turn on email<\/button>/)
  })

  it('has no em or en dash (CONTENT-VOICE)', () => {
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/[–—]/)
  })
})
