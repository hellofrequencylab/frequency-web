import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))

// The shell renders admin chrome that needs the router; the hand-off content is what is under test.
vi.mock('@/components/templates', () => ({
  FocusTemplate: ({ children }: { children: React.ReactNode }) => children,
}))

import NativeHandoffPage, { metadata } from './page'

const CODE = '3f2b8c1e-9a4d-4b7e-8f21-0c6d5e4a3b2c'
const render = async (sp: Record<string, string>) =>
  renderToStaticMarkup(await NativeHandoffPage({ searchParams: Promise.resolve(sp) }))

describe('/auth/native/open: the hand-off page', () => {
  it('offers the app (its own scheme) and the not-installed fallback (a fresh web sign-in)', async () => {
    const html = await render({ code: CODE, next: '/feed' })
    expect(html).toContain(`href="frequency://auth/callback?code=${CODE}&amp;next=%2Ffeed"`)
    expect(html).toContain('Open the app')
    expect(html).toContain('href="/sign-in?next=%2Ffeed"')
    expect(html).toContain('Sign in on the web')
    expect(html).not.toContain('href="/auth/callback')
  })

  it('a direct visit with no code goes back to sign-in', async () => {
    await expect(render({})).rejects.toThrow('REDIRECT:/sign-in?error=callback')
  })

  it('a direct visit with an expired error goes back to sign-in as expired', async () => {
    await expect(render({ error: 'access_denied', error_code: 'otp_expired' })).rejects.toThrow(
      'REDIRECT:/sign-in?error=expired',
    )
  })

  it('an unsafe next is dropped from both links', async () => {
    const html = await render({ code: CODE, next: '//evil.com' })
    expect(html).not.toContain('evil')
  })

  it('is noindex and sends no referrer', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.referrer).toBe('no-referrer')
  })
})
