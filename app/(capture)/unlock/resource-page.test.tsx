import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ resource: 'https://example.com/guide.pdf' as string | undefined }))
vi.mock('@/lib/crm/lead-links', () => ({
  parseLeadLink: () => ({ s: 'space', d: 'lead_magnet', l: 'The guide', r: state.resource }),
  isSafeHttpUrl: (raw?: string) => typeof raw === 'string' && raw.startsWith('https://'),
}))
vi.mock('@/lib/crm/capture-context', () => ({ loadSpaceName: async () => 'North Light' }))
vi.mock('./actions', () => ({ captureUnlock: async () => ({ ok: true }) }))
vi.mock('@/components/crm/leads/capture-shell', () => ({ CaptureShell: ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => React.createElement('main', {}, React.createElement('h1', {}, title), React.createElement('p', {}, description), children) }))
vi.mock('@/components/crm/leads/capture-form', () => ({ CaptureForm: ({ submitLabel }: { submitLabel: string }) => React.createElement('button', {}, submitLabel) }))
import UnlockPage from './page'
beforeEach(() => { vi.stubGlobal('React', React); vi.stubEnv('LEAD_MAGNET_RESOURCE_EMAIL_ENABLED', ''); state.resource = 'https://example.com/guide.pdf' })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
it('offers immediate resource access without an email-copy promise while off', async () => {
  const html = renderToStaticMarkup(await UnlockPage({ searchParams: Promise.resolve({ t: 'signed' }) }))
  expect(html).toContain('Leave your email to open it now.')
  expect(html).toContain('Open the resource')
  expect(html).not.toMatch(/email copy|Send it to me/)
})
it('offers the requested email copy only after explicit opt-in', async () => {
  vi.stubEnv('LEAD_MAGNET_RESOURCE_EMAIL_ENABLED', 'on')
  const html = renderToStaticMarkup(await UnlockPage({ searchParams: Promise.resolve({ t: 'signed' }) }))
  expect(html).toContain('request an email copy')
  expect(html).toContain('Send it to me')
})
it('keeps legacy contact-only mode unchanged regardless of the flag', async () => {
  state.resource = undefined
  for (const flag of ['', '1']) {
    vi.stubEnv('LEAD_MAGNET_RESOURCE_EMAIL_ENABLED', flag)
    const html = renderToStaticMarkup(await UnlockPage({ searchParams: Promise.resolve({ t: 'signed' }) }))
    expect(html).toContain('Stay in touch.')
    expect(html).toContain('Share my details')
    expect(html).not.toMatch(/email copy|Send it to me/)
  }
})
