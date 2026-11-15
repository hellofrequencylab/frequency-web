// Request-backed eligibility only. Background business ledger events do not inherit a browser request.
import { requestGoogleAllowed } from './server-google-policy'

export async function currentViewerAllowsAnalytics(): Promise<boolean> {
  return requestGoogleAllowed()
}
