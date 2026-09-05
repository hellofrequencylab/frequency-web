import { describe, it, expect, afterEach, vi } from 'vitest'

// The measurement id is read at MODULE LOAD, so each case stubs it, resets the module registry and
// re-imports (the lib/rate-limit.test.ts pattern). The deployment env is read at CALL time, and it
// is stubbed only after the import: vitest's JSX transform resolves react/jsx-dev-runtime against
// NODE_ENV at import, and a 'production' NODE_ENV there yields a runtime with no jsxDEV. The
// component is a Server Component with no hooks, so calling it as a function is a faithful
// render: null means the tag is not in the document.
async function loadTag(measurementId: string) {
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', measurementId)
  vi.resetModules()
  return import('./google-analytics')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

// 2026-09-05 (scan2 L3-03). The header comment promises the tag "never fires on preview
// deploys"; it gated on NODE_ENV, which Next forces to 'production' on every Vercel build. The
// gate is the Vercel deployment, with NODE_ENV as the fallback only when VERCEL_ENV is unset.
describe('GoogleAnalytics deployment gate', () => {
  it('renders nothing on a Vercel PREVIEW even though NODE_ENV is production', async () => {
    const { GoogleAnalytics } = await loadTag('G-TEST123')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(GoogleAnalytics()).toBeNull()
  })

  it('renders the tag for the Vercel PRODUCTION deployment', async () => {
    const { GoogleAnalytics } = await loadTag('G-TEST123')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(GoogleAnalytics()).not.toBeNull()
  })

  it('falls back to NODE_ENV only when VERCEL_ENV is unset', async () => {
    const { GoogleAnalytics } = await loadTag('G-TEST123')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', '')
    expect(GoogleAnalytics()).not.toBeNull()
  })

  it('renders nothing without a measurement id, whatever the deployment', async () => {
    const { GoogleAnalytics } = await loadTag('')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(GoogleAnalytics()).toBeNull()
  })
})
