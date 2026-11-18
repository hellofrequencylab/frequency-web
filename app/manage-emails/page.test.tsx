import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// EMAIL-079. A footer "Manage emails" link with no token is not a broken link (the sender held no
// profile for the reader, or it is a preview or test send), so the page must not call it one. A link
// that carries params that do not verify still fails closed. Neither state may read the database.

const prefs = vi.hoisted(() => ({ getPreferences: vi.fn(async () => ({ email_lifecycle: true })) }))

vi.mock('@/lib/notification-preferences', () => ({
  NOTIFICATION_CATEGORIES: ['dispatches', 'events', 'comments', 'mentions', 'lifecycle', 'matches'],
  getPreferences: prefs.getPreferences,
}))
vi.mock('./manage-form', () => ({ ManageEmailsForm: () => <form data-testid="manage-form" /> }))
// The card frames are not under test; both designs' frames are reduced to their slots.
vi.mock('@/components/templates', () => ({
  FocusTemplate: ({ title, description, children }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  ),
}))
vi.mock('@/components/frequency/site/pages/legal/legal-reading', () => ({
  FrequencyUtilityCard: ({ title, description, children }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  ),
}))

import ManageEmailsPage from './page'
import { makeUnsubscribeToken } from '@/lib/unsubscribe-tokens'

const PROFILE = '11111111-1111-4111-8111-111111111111'

async function render(sp: Record<string, string>): Promise<string> {
  return renderToStaticMarkup(await ManageEmailsPage({ searchParams: Promise.resolve(sp) }))
}

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = 'test-secret-test-secret-test-secret'
  prefs.getPreferences.mockClear()
})

describe('/manage-emails with no token', () => {
  it('reads as a way in, not an error, and offers the settings button', async () => {
    const html = await render({})
    expect(html).toContain('Manage your emails')
    expect(html).toContain('Sign in to open every email setting.')
    expect(html).toContain('href="/settings#notifications"')
    expect(html).not.toMatch(/invalid|expired/i)
    expect(html).not.toContain('data-testid="manage-form"')
    expect(prefs.getPreferences).not.toHaveBeenCalled()
  })

  it('keeps the voice rules: no em dash, no exclamation point', async () => {
    const html = await render({})
    expect(html).not.toMatch(/[—!]/)
  })
})

describe('/manage-emails with params', () => {
  it('fails closed on a token that does not verify, without reading the profile', async () => {
    const html = await render({ p: PROFILE, c: 'lifecycle', t: '0'.repeat(32) })
    expect(html).toContain('This link is invalid or expired.')
    expect(html).not.toContain('data-testid="manage-form"')
    expect(prefs.getPreferences).not.toHaveBeenCalled()
  })

  it('fails closed on a partial link (some params, no token)', async () => {
    const html = await render({ p: PROFILE })
    expect(html).toContain('This link is invalid or expired.')
    expect(prefs.getPreferences).not.toHaveBeenCalled()
  })

  it('shows the toggles for a signed link', async () => {
    const html = await render({ p: PROFILE, c: 'lifecycle', t: makeUnsubscribeToken(PROFILE, 'lifecycle') })
    expect(html).toContain('data-testid="manage-form"')
    expect(prefs.getPreferences).toHaveBeenCalledWith(PROFILE)
  })
})
