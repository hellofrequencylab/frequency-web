import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

// ── SCAN-1243 (ADR-1954): the proxy sends the nonce-based script policy only when a switch says so ──
//
// Like proxy-markers.test.ts this runs the REAL proxy against a real NextRequest. Only the Supabase
// session read is mocked. What it reads off the response:
//   · the policy headers a browser would get, and
//   · the request headers the proxy forwards to the render (`x-middleware-request-<name>`, the way
//     NextResponse.next({ request: { headers } }) carries them), because Next takes the nonce from
//     the REQUEST's Content-Security-Policy and the (main) layout from `x-nonce`.

const getClaims = vi.fn(async () => ({ data: { claims: { sub: 'member-1' } } as { claims: { sub: string } } | null }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getClaims } }),
}))

vi.mock('@/lib/platform-flags', () => ({
  referralsEnabled: async () => true,
}))

let NextRequest: typeof import('next/server').NextRequest
let proxy: typeof import('./proxy').proxy

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon-key-for-tests'
  ;({ NextRequest } = await import('next/server'))
  ;({ proxy } = await import('./proxy'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  getClaims.mockClear()
})

async function visit(path: string, opts: { signedIn?: boolean; headers?: Record<string, string> } = {}) {
  const signedIn = opts.signedIn ?? true
  const headers = new Headers(opts.headers)
  if (signedIn) headers.set('cookie', 'sb-test-auth-token=x; fq_acct=1')
  else getClaims.mockResolvedValueOnce({ data: null })
  const response = await proxy(new NextRequest(`https://frequencylocal.com${path}`, { headers }))
  return {
    status: response.status,
    enforced: response.headers.get('content-security-policy'),
    reportOnly: response.headers.get('content-security-policy-report-only'),
    forwardedNonce: response.headers.get('x-middleware-request-x-nonce'),
    forwardedPolicy: response.headers.get('x-middleware-request-content-security-policy'),
    rewrite: response.headers.get('x-middleware-rewrite'),
    all: [...response.headers.keys()],
  }
}

function nonceIn(policy: string | null): string | null {
  return /'nonce-([^']+)'/.exec(policy ?? '')?.[1] ?? null
}

describe('both switches blank (the default): the proxy sends what it sent before', () => {
  it.each(['/feed', '/spaces/acme/manage', '/events/sound-bath', '/pricing', '/'])('%s carries no policy header and no nonce', async (path) => {
    const seen = await visit(path)
    expect(seen.enforced).toBeNull()
    expect(seen.reportOnly).toBeNull()
    expect(seen.forwardedNonce).toBeNull()
    expect(seen.forwardedPolicy).toBeNull()
    expect(seen.all.filter((name) => /content-security-policy|nonce/.test(name))).toEqual([])
  })

  it('a nonce a caller sends is not passed to the render', async () => {
    const seen = await visit('/feed', { headers: { 'x-nonce': 'attacker' } })
    expect(seen.forwardedNonce).toBeNull()
  })
})

describe('the test run: CSP_NONCE_REPORT_ONLY=1', () => {
  // Rewritten 2026-11-23 on the owner's answer ("Yes, fix the test run"). This case used to hold
  // that the proxy sends NO enforced header during the run. Measured on Vercel, that made the run
  // blind: Next reads the nonce from the enforced header, found the static one, and stamped nothing.
  // The promise now is that the enforced header names the nonce and still allows what today's does.
  it('a member page gets the strict policy as report-only, and an enforced header that names the same nonce without tightening anything', async () => {
    vi.stubEnv('CSP_NONCE_REPORT_ONLY', '1')
    const seen = await visit('/feed')
    expect(seen.reportOnly).toContain("'strict-dynamic'")
    expect(seen.reportOnly).not.toMatch(/script-src[^;]*'unsafe-inline'/)
    const nonce = nonceIn(seen.reportOnly)
    expect(nonce).toBeTruthy()
    expect(seen.forwardedNonce).toBe(nonce)

    const enforced = (seen.enforced ?? '').split('; ')
    expect(enforced.find((d) => d.startsWith('script-src')), 'Next takes the first script-src directive').toContain(`'nonce-${nonce}'`)
    // Every <script> is still judged by today's sources: inline allowed, no nonce or hash required.
    const elem = enforced.find((d) => d.startsWith('script-src-elem '))
    expect(elem).toContain("'unsafe-inline'")
    expect(elem).not.toMatch(/'nonce-|'sha256-|'strict-dynamic'/)
    expect(enforced).toContain("script-src-attr 'unsafe-inline'")
    expect(seen.enforced).not.toContain("'strict-dynamic'")
    // And the render is handed that same header, so the two sides cannot disagree about the nonce.
    expect(seen.forwardedPolicy).toBe(seen.enforced)
  })

  it('a member on a share URL is rewritten to the member page, which gets it too', async () => {
    vi.stubEnv('CSP_NONCE_REPORT_ONLY', '1')
    for (const [path, target] of [['/events/sound-bath', '/events/sound-bath/full'], ['/spaces/acme', '/spaces/acme/full']]) {
      const seen = await visit(path)
      expect(seen.rewrite, path).toContain(target)
      expect(nonceIn(seen.reportOnly), path).toBeTruthy()
      expect(seen.forwardedNonce, path).toBe(nonceIn(seen.reportOnly))
    }
  })

  it('static pages get nothing, signed in or out', async () => {
    vi.stubEnv('CSP_NONCE_REPORT_ONLY', '1')
    for (const path of ['/pricing', '/discover/circles', '/themes/nocturne']) {
      const seen = await visit(path)
      expect(seen.reportOnly, path).toBeNull()
      expect(seen.forwardedNonce, path).toBeNull()
    }
    for (const path of ['/events/sound-bath', '/spaces/acme', '/']) {
      const seen = await visit(path, { signedIn: false })
      expect(seen.reportOnly, path).toBeNull()
      expect(seen.forwardedNonce, path).toBeNull()
    }
  })

  it('a client navigation (RSC) gets nothing: it is not a document', async () => {
    vi.stubEnv('CSP_NONCE_REPORT_ONLY', '1')
    const seen = await visit('/feed', { headers: { rsc: '1' } })
    expect(seen.reportOnly).toBeNull()
    expect(seen.forwardedNonce).toBeNull()
  })

  it('a redirect carries no policy', async () => {
    vi.stubEnv('CSP_NONCE_REPORT_ONLY', '1')
    const seen = await visit('/circles/abc/manage', { signedIn: false })
    expect(seen.status).toBe(307)
    expect(seen.reportOnly).toBeNull()
  })
})

describe('enforcing: CSP_NONCE_ENFORCE=1', () => {
  it('the same policy goes out as Content-Security-Policy on member pages only', async () => {
    vi.stubEnv('CSP_NONCE_ENFORCE', '1')
    const member = await visit('/feed')
    expect(member.reportOnly).toBeNull()
    expect(nonceIn(member.enforced)).toBeTruthy()
    expect(member.forwardedNonce).toBe(nonceIn(member.enforced))
    const marketing = await visit('/pricing')
    expect(marketing.enforced).toBeNull()
  })
})
