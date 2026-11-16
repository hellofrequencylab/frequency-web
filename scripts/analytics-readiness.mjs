// Read-only readiness checks. Never print environment values, credentials or response bodies.
import { invokedDirectly } from './lib/invoked-directly.mjs'
import { growthSnapshotSchema } from '../lib/analytics/growth.ts'

function webUrl(raw) {
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url
  } catch { return null }
}

/**
 * @typedef {Record<string, string | undefined>} AnalyticsEnvironment
 * @typedef {{state: 'not_configured' | 'verified' | 'blocked', reason: string, propertyConfigured: boolean, credentialConfigured: boolean, reports?: Array<{id: string, rows: number, warnings: string[]}>}} GoogleReadiness
 * @param {{env?: AnalyticsEnvironment, fetchImpl?: typeof fetch, requireGoogle?: boolean, pageUrl?: string, verifyGoogle?: (options: {env: AnalyticsEnvironment, request: typeof fetch}) => Promise<GoogleReadiness>, validateSnapshot?: (value: unknown) => boolean}} [options]
 */
export async function verifyAnalyticsReadiness({
  env = process.env,
  fetchImpl = globalThis.fetch,
  requireGoogle = false,
  pageUrl = env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  verifyGoogle,
  validateSnapshot = (value) => growthSnapshotSchema.safeParse(value).success,
} = {}) {
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
  const missing = names.filter((name) => !env[name]?.trim())
  const checks = {
    configuration: {
      state: missing.length ? 'blocked' : 'configured',
      message: missing.length ? 'Required Supabase variables are absent.' : 'Required variable names are present; presence alone does not verify access.',
      missing,
    },
    snapshot: { state: 'blocked', message: 'Supabase snapshot has not been verified.' },
    web: { state: 'blocked', message: 'The web page has not been verified.' },
    google: { state: 'not_configured', reason: 'No Google reporting property is selected.', propertyConfigured: false, credentialConfigured: false },
  }

  const candidateProject = webUrl(env.NEXT_PUBLIC_SUPABASE_URL)
  const projectUrl = candidateProject && (candidateProject.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(candidateProject.hostname)) ? candidateProject : null
  if (env.NEXT_PUBLIC_SUPABASE_URL && !projectUrl) {
    checks.snapshot = { state: 'blocked', message: 'The Supabase URL is invalid.' }
  } else if (projectUrl && env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    try {
      const response = await fetchImpl(new URL('/rest/v1/rpc/analytics_growth_snapshot', projectUrl), {
        method: 'POST',
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ _days: 30 }), signal: AbortSignal.timeout(15_000), redirect: 'error',
      })
      if (!response.ok) checks.snapshot = { state: 'blocked', message: 'The Supabase snapshot request was refused or failed.', httpStatus: response.status }
      else {
        const valid = validateSnapshot(await response.json())
        checks.snapshot = valid
          ? { state: 'verified', message: 'The snapshot RPC returned a complete, valid aggregate contract.' }
          : { state: 'blocked', message: 'The snapshot response is incomplete or does not match the application contract.' }
      }
    } catch { checks.snapshot = { state: 'blocked', message: 'The snapshot could not be reached or decoded. Check network policy, credentials and migration activation.' } }
  }

  const page = webUrl(pageUrl)
  if (!page) checks.web = { state: 'blocked', message: 'The page URL is invalid.' }
  else {
    try {
      const response = await fetchImpl(page, { signal: AbortSignal.timeout(15_000), redirect: 'error' })
      if (!response.ok) checks.web = { state: 'blocked', message: 'The page returned an unsuccessful response.', httpStatus: response.status }
      else {
        const html = await response.text()
        checks.web = /frequency/i.test(html)
          ? { state: 'verified', message: 'The page returned successful HTML containing Frequency branding.' }
          : { state: 'blocked', message: 'The page response did not contain the expected Frequency content.' }
      }
    } catch { checks.web = { state: 'blocked', message: 'The page could not be reached. Start the app or check the selected page and network policy.' } }
  }

  if (requireGoogle || env.GA4_REPORTING_PROPERTY_ID?.trim()) {
    try {
      const check = verifyGoogle || (await import('./google-analytics-readiness.mjs')).verifyGoogleReporting
      checks.google = await check({ env, request: fetchImpl })
    } catch {
      checks.google = { state: 'blocked', reason: 'Google reporting verification could not run. Check reporting configuration and the read-only verifier.', propertyConfigured: !!env.GA4_REPORTING_PROPERTY_ID?.trim(), credentialConfigured: false }
    }
  }
  const googleRequired = requireGoogle || !!env.GA4_REPORTING_PROPERTY_ID?.trim()
  return {
    ready: checks.configuration.state === 'configured' && checks.snapshot.state === 'verified' && checks.web.state === 'verified' && (!googleRequired || checks.google.state === 'verified'),
    googleRequired,
    checks,
    limits: 'Read-only current-instance checks. Does not apply migrations, create Google reports, validate browser consent or prove production deployment.',
  }
}

if (invokedDirectly(import.meta.url)) {
  const result = await verifyAnalyticsReadiness({ requireGoogle: process.argv.includes('--require-google') })
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.ready ? 0 : 1
}
