import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE CLICK REDIRECT (HYG-143). A tracked link goes where it was signed to go, or to the site root.
// The HMAC binding of `u` to the token is checked FIRST on every request, so the send lookup (a
// database read) only runs for a link this platform actually minted, and no query parameter can
// decide whether the check runs at all.

const { sendRow, inserted, lookups } = vi.hoisted(() => ({
  sendRow: vi.fn(),
  inserted: vi.fn(),
  lookups: vi.fn(),
}))

vi.mock('@/lib/signing-secret', () => ({ signingSecret: () => 'test-secret' }))
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://site.test' }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'space_email_events') {
        return { insert: (rows: unknown[]) => { inserted(rows); return Promise.resolve({ error: null }) } }
      }
      if (table === 'outreach_sends') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => { lookups(); return Promise.resolve({ data: sendRow() }) } }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

const { encodeSendToken, injectTracking } = await import('@/lib/spaces/email-tracking')
const { GET } = await import('./route')

const SEND = '0b6f3c2a-1d4e-4f5a-8b9c-0d1e2f3a4b5c'
const DEST = 'https://example.org/class?id=7'

function signedLink(token: string, dest: string): URL {
  const html = injectTracking(`<a href="${dest}">go</a>`, token, 'https://site.test')
  const href = /href="([^"]+)"/.exec(html)?.[1]
  if (!href) throw new Error('no tracked link')
  return new URL(href.replace(/&amp;/g, '&'))
}

async function follow(url: URL, token: string): Promise<string | null> {
  const res = await GET(new Request(url), { params: Promise.resolve({ token }) })
  expect(res.status).toBe(302)
  return res.headers.get('location')
}

beforeEach(() => {
  vi.clearAllMocks()
  sendRow.mockReturnValue({ space_id: 'space_1', email: 'someone@example.com' })
})

describe('GET /e/c/[token]', () => {
  it('follows a signed link to its destination and records the click', async () => {
    const token = encodeSendToken(SEND)
    expect(await follow(signedLink(token, DEST), token)).toBe(DEST)
    expect(inserted).toHaveBeenCalledTimes(1)
  })

  it('sends a swapped destination to the site root without reading the send', async () => {
    const token = encodeSendToken(SEND)
    const url = signedLink(token, DEST)
    url.searchParams.set('u', 'https://evil.test/')
    expect(await follow(url, token)).toBe('https://site.test/')
    expect(lookups).not.toHaveBeenCalled()
    expect(inserted).not.toHaveBeenCalled()
  })

  it('sends a link with no destination or no signature to the site root without reading the send', async () => {
    const token = encodeSendToken(SEND)
    const noDest = signedLink(token, DEST)
    noDest.searchParams.delete('u')
    const noSig = signedLink(token, DEST)
    noSig.searchParams.delete('s')
    expect(await follow(noDest, token)).toBe('https://site.test/')
    expect(await follow(noSig, token)).toBe('https://site.test/')
    expect(lookups).not.toHaveBeenCalled()
  })

  it('sends a signed link whose send no longer exists to the site root', async () => {
    sendRow.mockReturnValue(null)
    const token = encodeSendToken(SEND)
    expect(await follow(signedLink(token, DEST), token)).toBe('https://site.test/')
    expect(inserted).not.toHaveBeenCalled()
  })
})
