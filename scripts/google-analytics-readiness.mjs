// Read-only, safe diagnostic metadata for the selected GA4 property. No tokens, labels or account file contents are printed.
import { invokedDirectly } from './lib/invoked-directly.mjs'
import { GOOGLE_REPORTING_SPEC } from '../lib/analytics/google-reporting.ts'
import { googleReportingConfig, readGoogleReports } from '../lib/analytics/google-data.ts'
import { getGoogleReportingAccessToken, googleCredentialConfigured } from '../lib/analytics/google-auth.ts'

export async function verifyGoogleReporting(options = {}) {
  const env = options.env ?? process.env
  const propertyConfigured = !!env.GA4_REPORTING_PROPERTY_ID?.trim()
  const credentialConfigured = googleCredentialConfigured(env)
  const base = { propertyConfigured, credentialConfigured }
  const config = googleReportingConfig(env)
  if (!config) return { ...base, state: propertyConfigured ? 'blocked' : 'not_configured', reason: propertyConfigured ? 'invalid_property_or_hostname' : 'property_not_selected' }
  const token = await getGoogleReportingAccessToken({ env, request: options.request, readCredentialFile: options.readCredentialFile })
  if (!token) return { ...base, state: 'blocked', reason: 'credentials_unavailable_or_unsupported' }
  const result = await readGoogleReports(config, token, options.request)
  if (result.state !== 'available') return { ...base, state: 'blocked', reason: result.reason }
  return { ...base, state: 'verified', reason: 'read_only_reports_returned', reports: result.reports.map((r) => ({ id: r.id, rows: r.rows.length, warnings: r.warnings })) }
}

if (invokedDirectly(import.meta.url)) {
  const result = process.argv.includes('--spec') ? GOOGLE_REPORTING_SPEC : await verifyGoogleReporting()
  console.log(JSON.stringify(result, null, 2))
  if (result.state === 'blocked') process.exitCode = 1
}
