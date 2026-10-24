import { afterEach, expect, it, vi } from 'vitest'
import type { NextConfig } from 'next'

vi.mock('@sentry/nextjs/config', () => ({ withSentryConfig: (config: NextConfig) => config }))
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

async function policy(dsn: string) {
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', dsn)
  vi.stubEnv('SENTRY_DSN', '')
  vi.stubEnv('NODE_ENV', 'production')
  vi.resetModules()
  const { default: config } = await import('../../next.config')
  const rules = await config.headers!()
  return rules.flatMap(rule => rule.headers).find(header => header.key === 'Content-Security-Policy')!.value
}

it('permits only the configured ingest origin without leaking its credentials or project path', async () => {
  const csp = await policy('https://public-key@o123.ingest.us.sentry.io/456')
  const connect = csp.split(';').find(rule => rule.trim().startsWith('connect-src '))!
  expect(connect.split(/\s+/)).toContain('https://o123.ingest.us.sentry.io')
  expect(csp).not.toContain('public-key')
  expect(csp).not.toContain('/456')
  expect(csp).not.toContain('*.sentry.io')
  expect(csp).toContain("object-src 'none'")
  expect(csp).toContain("frame-ancestors 'self'")
  expect(csp).not.toContain("'unsafe-eval'")
})

it.each(['', 'not-a-dsn', 'javascript:alert(1)', 'http://example.test/1'])('keeps unsafe or absent telemetry configuration out of the policy: %s', async dsn => {
  const csp = await policy(dsn)
  expect(csp).not.toContain('example.test')
  expect(csp).not.toContain('javascript:')
  expect(csp).not.toContain('not-a-dsn')
  expect(csp).not.toContain('sentry.io')
})
