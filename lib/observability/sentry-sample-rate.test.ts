import { describe, expect, it } from 'vitest'
import { tracesSampleRate } from './sentry'

// HYG-162 / ADR-1706: previews are untraced, production and the override are unchanged.
describe('tracesSampleRate', () => {
  it('is zero on a preview deployment', () => {
    expect(tracesSampleRate({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(0)
  })
  it('stays low in production and full in development', () => {
    expect(tracesSampleRate({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toBe(0.1)
    expect(tracesSampleRate({ NODE_ENV: 'development' })).toBe(1)
  })
  it('honours an explicit override everywhere', () => {
    expect(tracesSampleRate({ NODE_ENV: 'production', VERCEL_ENV: 'preview', SENTRY_TRACES_SAMPLE_RATE: '0.5' })).toBe(0.5)
    expect(tracesSampleRate({ NODE_ENV: 'production', SENTRY_TRACES_SAMPLE_RATE: 'nope' })).toBe(0.1)
  })
})
