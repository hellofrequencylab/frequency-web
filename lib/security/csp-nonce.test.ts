import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import type { NextConfig } from 'next'
// Next's own reader: the nonce is only useful if THIS function finds it in the header.
import { getScriptNonceFromHeader } from 'next/dist/server/app-render/get-script-nonce-from-header'
import { buildNoncePolicy, enforcedDirectives, inlineScriptSources, nonceCspFor, scriptHashSource } from './csp-nonce'

// SCAN-1243 (ADR-1954): the nonce-based script policy and its two rollout switches.
//
// The promise this file holds: with both switches blank, production sends exactly the header it
// sends today; with the test-run switch on, a member-app document also gets a report-only policy
// that carries a nonce and 'strict-dynamic' and no 'unsafe-inline' script source.

vi.mock('@sentry/nextjs/config', () => ({ withSentryConfig: (config: NextConfig) => config }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const REPORT_ONLY = 'CSP_NONCE_REPORT_ONLY'
const ENFORCE = 'CSP_NONCE_ENFORCE'

function documentRequest(over: { method?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers(over.headers)
  return { method: over.method ?? 'GET', headers, cookies: { get: () => undefined } }
}

/** The enforced header next.config.ts sends on every route, read the way a deploy reads it. */
async function configHeader(env: Record<string, string> = {}): Promise<string[]> {
  vi.stubEnv('NODE_ENV', 'production')
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  vi.resetModules()
  const { default: config } = await import('../../next.config')
  const rules = await config.headers!()
  return rules.flatMap((rule) => rule.headers).filter((header) => /^content-security-policy/i.test(header.key)).map((h) => `${h.key}: ${h.value}`)
}

function scriptSrc(policy: string): string[] {
  const directive = policy.split('; ').find((d) => d.startsWith('script-src '))
  if (!directive) throw new Error('no script-src')
  return directive.split(' ').slice(1)
}

describe('both switches off: nothing changes', () => {
  it.each([
    ['unset', {}],
    ['blank', { [REPORT_ONLY]: '', [ENFORCE]: '' }],
    ['an unrecognised value', { [REPORT_ONLY]: 'yes', [ENFORCE]: '0' }],
  ])('%s: a member page gets no nonce policy', async (_name, env) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string)
    expect(await nonceCspFor(documentRequest(), '/feed')).toBeNull()
    expect(await nonceCspFor(documentRequest(), '/spaces/acme/manage')).toBeNull()
  })

  it('the enforced header in next.config.ts is the restated one, byte for byte', async () => {
    const sent = await configHeader()
    expect(sent).toEqual([`Content-Security-Policy: ${enforcedDirectives(false).join('; ')}`])
  })

  it('and the switches do not reach next.config.ts: the same single header with either one on', async () => {
    const off = await configHeader()
    expect(await configHeader({ [REPORT_ONLY]: '1' })).toEqual(off)
    expect(await configHeader({ [ENFORCE]: '1' })).toEqual(off)
    // Today's header, pinned on the one directive this row is about, so "identical to today" is
    // not only "identical to a copy that was edited in the same change".
    expect(off[0]).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.googletagmanager.com https://va.vercel-scripts.com https://vercel.live https://*.vercel.live https://maps.googleapis.com https://maps.gstatic.com https://js.stripe.com;")
    expect(off[0]).toContain('report-uri /api/csp-report')
    expect(off[0]).not.toContain('nonce-')
    expect(off[0]).not.toContain('strict-dynamic')
  })
})

describe('the test run: CSP_NONCE_REPORT_ONLY', () => {
  it.each(['1', 'true', 'on', ' ON '])('%s: a member document gets the strict policy, report-only', async (value) => {
    vi.stubEnv(REPORT_ONLY, value)
    const csp = await nonceCspFor(documentRequest(), '/feed')
    expect(csp).not.toBeNull()
    expect(csp!.header).toBe('Content-Security-Policy-Report-Only')

    const sources = scriptSrc(csp!.policy)
    expect(sources).toContain(`'nonce-${csp!.nonce}'`)
    expect(sources).toContain("'strict-dynamic'")
    expect(sources).not.toContain("'unsafe-inline'")
    expect(sources).not.toContain("'unsafe-eval'")
    // Next finds the same nonce in the header it is handed.
    expect(getScriptNonceFromHeader(csp!.policy)).toBe(csp!.nonce)
    // Reports go to the existing sink, tagged.
    expect(csp!.policy.endsWith('report-uri /api/csp-report?policy=nonce')).toBe(true)
  })

  it('a fresh nonce for every document', async () => {
    vi.stubEnv(REPORT_ONLY, '1')
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) seen.add((await nonceCspFor(documentRequest(), '/feed'))!.nonce)
    expect(seen.size).toBe(50)
    for (const nonce of seen) expect(atob(nonce).length).toBe(16)
  })

  it('not on a response that is not a document', async () => {
    vi.stubEnv(REPORT_ONLY, '1')
    expect(await nonceCspFor(documentRequest({ headers: { rsc: '1' } }), '/feed')).toBeNull()
    expect(await nonceCspFor(documentRequest({ headers: { rsc: '1', 'next-router-prefetch': '1' } }), '/feed')).toBeNull()
    expect(await nonceCspFor(documentRequest({ method: 'POST', headers: { 'next-action': '7f3a' } }), '/feed')).toBeNull()
  })

  it('not on a static page', async () => {
    vi.stubEnv(REPORT_ONLY, '1')
    for (const path of ['/', '/pricing', '/discover/circles', '/help', '/events/sound-bath', '/spaces/acme', '/themes/nocturne', '/sign-in', '/join']) {
      expect(await nonceCspFor(documentRequest(), path), path).toBeNull()
    }
  })
})

describe('enforcing: CSP_NONCE_ENFORCE', () => {
  it('sends the same policy as Content-Security-Policy, and wins over the test-run switch', async () => {
    vi.stubEnv(ENFORCE, '1')
    expect((await nonceCspFor(documentRequest(), '/feed'))!.header).toBe('Content-Security-Policy')
    vi.stubEnv(REPORT_ONLY, '1')
    expect((await nonceCspFor(documentRequest(), '/feed'))!.header).toBe('Content-Security-Policy')
  })

  it('blanking it again is the rollback', async () => {
    vi.stubEnv(ENFORCE, '1')
    expect(await nonceCspFor(documentRequest(), '/feed')).not.toBeNull()
    vi.stubEnv(ENFORCE, '')
    expect(await nonceCspFor(documentRequest(), '/feed')).toBeNull()
  })
})

describe('the strict policy is today’s policy with one directive changed', () => {
  const policy = buildNoncePolicy({ nonce: 'dGVzdC1ub25jZS0xMjM0NQ==', scriptHashes: ["'sha256-abc='"], isDev: false })

  it('every directive but script-src and report-uri is identical', () => {
    const today = enforcedDirectives(false)
    const strict = policy.split('; ')
    expect(strict.length).toBe(today.length)
    today.forEach((directive, i) => {
      if (directive.startsWith('script-src ') || directive.startsWith('report-uri ')) return
      expect(strict[i]).toBe(directive)
    })
  })

  it('script-src keeps every host and adds nothing wider', () => {
    const today = enforcedDirectives(false).find((d) => d.startsWith('script-src '))!.split(' ').slice(1)
    const strict = scriptSrc(policy)
    for (const source of today) {
      if (source === "'unsafe-inline'") continue
      expect(strict).toContain(source)
    }
    const added = strict.filter((source) => !today.includes(source))
    expect(added).toEqual(["'nonce-dGVzdC1ub25jZS0xMjM0NQ=='", "'strict-dynamic'", "'report-sample'", "'sha256-abc='"])
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/)
    expect(policy).not.toMatch(/script-src[^;]* https:(?: |;|$)/)
  })

  it('development keeps unsafe-eval for React, as today', () => {
    expect(scriptSrc(buildNoncePolicy({ nonce: 'YWJj', scriptHashes: [], isDev: true }))).toContain("'unsafe-eval'")
  })

  it('refuses a nonce that could break out of the header', () => {
    expect(() => buildNoncePolicy({ nonce: "x' 'unsafe-inline", scriptHashes: [], isDev: false })).toThrow()
    expect(() => buildNoncePolicy({ nonce: 'a;b', scriptHashes: [], isDev: false })).toThrow()
    expect(() => buildNoncePolicy({ nonce: '', scriptHashes: [], isDev: false })).toThrow()
  })
})

describe('the constant inline scripts are allowed by hash', () => {
  it('each one’s SHA-256 is in the policy the proxy sends', async () => {
    vi.stubEnv(REPORT_ONLY, '1')
    const csp = await nonceCspFor(documentRequest(), '/feed')
    const sources = scriptSrc(csp!.policy)
    const scripts = inlineScriptSources()
    expect(scripts.length).toBe(5)
    for (const script of scripts) {
      expect(script.length).toBeGreaterThan(20)
      const expected = `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`
      expect(await scriptHashSource(script)).toBe(expected)
      expect(sources).toContain(expected)
    }
  })

  it('the side script that is hashed is the literal the site root renders', async () => {
    const { readFileSync } = await import('node:fs')
    const { SIDE_PREPAINT_SCRIPT } = await import('@/lib/ui/side-prepaint')
    const component = readFileSync(new URL('../../components/frequency/site/shell/site-root.tsx', import.meta.url), 'utf8')
    expect(component, 'site-root.tsx and lib/ui/side-prepaint.ts must hold the same script text').toContain(`__html: ${JSON.stringify(SIDE_PREPAINT_SCRIPT)},`)
    // And it is the only inline script in that component.
    expect(component.match(/<script/g)?.length).toBe(1)
  })

  it('the analytics script that is hashed is the one the root layout renders', async () => {
    const { analyticsHeadScript } = await import('@/lib/consent/analytics-head')
    const { GoogleAnalytics, FirstPartyAnalyticsPolicy } = await import('@/components/analytics/google-analytics')
    const rendered = [GoogleAnalytics(), FirstPartyAnalyticsPolicy()].filter(Boolean) as { props: { dangerouslySetInnerHTML: { __html: string } } }[]
    expect(rendered.length).toBe(1)
    expect(rendered[0].props.dangerouslySetInnerHTML.__html).toBe(analyticsHeadScript())
  })
})
