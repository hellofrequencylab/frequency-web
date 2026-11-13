import 'server-only'
import { requireAdmin } from '@/lib/admin/guard'
import { getGoogleReportingAccessToken, googleReportingCredentialKey } from './google-auth'
import { googleReportingConfig, readGoogleReports, type GoogleAnalyticsReading } from './google-data'

let cached: { key: string; until: number; reading: GoogleAnalyticsReading } | null = null
let pending: { key: string; promise: Promise<GoogleAnalyticsReading> } | null = null

/** Fixed reporting access behind the Insights gate. Cache is private, bounded to five minutes and configuration-specific. */
export async function getGoogleAnalyticsReading(): Promise<GoogleAnalyticsReading> {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })
  const config = googleReportingConfig()
  if (!config) return { state: 'unavailable', reason: 'not_configured', message: 'Google reporting is not connected. Select the numeric GA4 property ID and production hostname in environment settings.' }
  const key = `${config.propertyId}:${config.hostname}:${googleReportingCredentialKey()}`
  if (cached?.key === key && cached.until > Date.now()) return cached.reading
  if (pending?.key === key) return pending.promise
  const read = async (): Promise<GoogleAnalyticsReading> => {
    const token = await getGoogleReportingAccessToken()
    if (!token) return { state: 'unavailable', reason: 'credentials_unavailable', message: 'A Google reporting credential is unavailable. Use an identity with Viewer access to the selected property; never enter credentials in chat.' }
    const reading = await readGoogleReports(config, token)
    if (reading.state === 'available') cached = { key, until: Date.now() + 5 * 60_000, reading }
    return reading
  }
  const promise = read()
  pending = { key, promise }
  try { return await promise } finally { if (pending?.promise === promise) pending = null }
}
