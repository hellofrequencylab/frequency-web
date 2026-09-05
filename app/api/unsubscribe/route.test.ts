import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'

// ── A GET of /api/unsubscribe must NEVER unsubscribe anyone (L2-01) ──────────────────────────────
//
// WHY THIS TEST EXISTS. This URL is the first entry in every bulk email's `List-Unsubscribe`
// header (lib/email.ts `listUnsubscribeHeaders`). Until 2026-09-05 the route exported a GET that
// forwarded to POST, so every HTTP GET of the header URL performed the unsubscribe. Corporate
// link scanners and mail-client prefetchers GET every URL in an email before the member has read
// it, so members were opted out silently, and nothing failed: the route 200'd, the member saw
// nothing, and the only symptom was "I stopped getting Dispatches and never asked to".
//
// RFC 8058 one-click is POST by definition (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`),
// so the fix costs nothing standards-conformant: POST still acts, GET redirects a human to the
// /unsubscribe confirm page carrying the same query. Both halves are pinned here against the
// REAL handlers with the actions mocked, and the source shape is pinned as well so a
// "helpful" `GET = POST` alias cannot come back.

const actions = vi.hoisted(() => ({
  processUnsubscribe: vi.fn(async () => ({ ok: true, data: { category: 'events' } })),
  processSpaceUnsubscribe: vi.fn(async () => ({ ok: true, data: { scope: 'space' } })),
}))

vi.mock('@/app/unsubscribe/actions', () => actions)

import { GET, POST } from './route'

const SRC = readFileSync('app/api/unsubscribe/route.ts', 'utf8')
const QUERY = 'p=profile-1&c=events&t=0123456789abcdef0123456789abcdef'

function request(method: 'GET' | 'POST', query = QUERY) {
  return new NextRequest(`https://frequencylocal.com/api/unsubscribe?${query}`, {
    method,
    ...(method === 'POST'
      ? {
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'List-Unsubscribe=One-Click',
        }
      : {}),
  })
}

beforeEach(() => {
  actions.processUnsubscribe.mockClear()
  actions.processSpaceUnsubscribe.mockClear()
})

describe('GET /api/unsubscribe (a link scanner, a prefetcher, or a human click)', () => {
  it('does not call either unsubscribe action', async () => {
    await GET(request('GET'))
    expect(actions.processUnsubscribe).not.toHaveBeenCalled()
    expect(actions.processSpaceUnsubscribe).not.toHaveBeenCalled()
  })

  it('redirects (302) to the /unsubscribe confirm page with the same query', async () => {
    const res = await GET(request('GET'))
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location') ?? '')
    expect(location.pathname).toBe('/unsubscribe')
    expect(location.search).toBe(`?${QUERY}`)
  })

  it('carries the per-Space query (s / e / t) through the redirect untouched', async () => {
    const q = 's=space-A&e=someone%40example.com&t=0123456789abcdef0123456789abcdef'
    const res = await GET(request('GET', q))
    expect(res.status).toBe(302)
    expect(new URL(res.headers.get('location') ?? '').search).toBe(`?${q}`)
    expect(actions.processSpaceUnsubscribe).not.toHaveBeenCalled()
  })
})

describe('POST /api/unsubscribe (RFC 8058 one-click from the mailbox provider)', () => {
  it('still performs the member unsubscribe from the query params', async () => {
    const res = await POST(request('POST'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(actions.processUnsubscribe).toHaveBeenCalledTimes(1)
    expect(actions.processUnsubscribe).toHaveBeenCalledWith({
      profileId: 'profile-1',
      category: 'events',
      token: '0123456789abcdef0123456789abcdef',
    })
    expect(actions.processSpaceUnsubscribe).not.toHaveBeenCalled()
  })

  it('still performs the per-Space unsubscribe when s / e are present', async () => {
    const res = await POST(request('POST', 's=space-A&e=someone%40example.com&t=tok'))
    expect(res.status).toBe(200)
    expect(actions.processSpaceUnsubscribe).toHaveBeenCalledWith({
      spaceId: 'space-A',
      email: 'someone@example.com',
      token: 'tok',
    })
    expect(actions.processUnsubscribe).not.toHaveBeenCalled()
  })
})

describe('source shape: GET cannot be re-aliased onto POST', () => {
  // The body of the exported GET, from its signature to the next top-level `}`.
  const getBody = (() => {
    const m = /export async function GET\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(SRC)
    return m?.[1] ?? ''
  })()

  it('exports a GET whose body neither forwards to POST nor names an unsubscribe action', () => {
    expect(getBody.length).toBeGreaterThan(0)
    expect(getBody).not.toMatch(/\bPOST\s*\(/)
    expect(getBody).not.toMatch(/processUnsubscribe|processSpaceUnsubscribe/)
  })

  it('redirects from GET (a plain `GET = POST` alias would also fail the runtime test above)', () => {
    expect(getBody).toMatch(/NextResponse\.redirect\(/)
    expect(SRC).not.toMatch(/export\s+(const|let|var)\s+GET\s*=/)
  })
})
