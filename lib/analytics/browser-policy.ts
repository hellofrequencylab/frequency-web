import { analyticsAllowed, parseConsentChoice, CONSENT_COOKIE, CONSENT_REGION_COOKIE, ANALYTICS_OPTOUT_COOKIE } from '@/lib/consent/cookie-consent'

const ANALYTICS_POLICY_CHANGED = 'fq-analytics-policy-changed'
const ANALYTICS_POLICY_STORAGE = 'fq-analytics-policy-update'

declare global {
  interface Window {
    /** Set true only by the production head after a successful private request-policy response. */
    __fqAnalyticsAllowed?: boolean
    /** Google is separately disabled on preview/dev deployments and when no measurement ID is configured. */
    __fqGoogleEnabled?: boolean
  }
}

export function browserGoogleAllowed(): boolean {
  return browserAllowsAnalytics() && window.__fqGoogleEnabled === true
}

/** Check fresh cookies on every event: an old tag or previously granted policy is not current consent. */
export function browserAllowsAnalytics(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const read = (name: string) => document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1)
    if (!analyticsAllowed({ choice: parseConsentChoice(read(CONSENT_COOKIE)), priorConsentRegion: read(CONSENT_REGION_COOKIE) === '1' })) return false
    if (read(ANALYTICS_OPTOUT_COOKIE) === '1' || window.localStorage.getItem('freq-ga-optout') === '1') return false
    const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
    if (gaId && window.__fqGoogleEnabled === true && (window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`] === true) return false
    return window.__fqAnalyticsAllowed === true
  } catch { return false }
}

/** Invalidate synchronously; grants always require a fresh server response before becoming eligible again. */
export function updateBrowserAnalyticsPolicy(refresh: boolean, broadcast = true): void {
  if (typeof window === 'undefined') return
  window.__fqAnalyticsAllowed = false
  window.__fqGoogleEnabled = false
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  if (gaId) (window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`] = true
  window.dispatchEvent(new CustomEvent(ANALYTICS_POLICY_CHANGED, { detail: { refresh } }))
  if (broadcast) {
    try { window.localStorage.setItem(ANALYTICS_POLICY_STORAGE, JSON.stringify({ refresh, at: Date.now() })) } catch { /* current-tab suppression already happened */ }
  }
  if (refresh) window.__fqGa?.()
}
