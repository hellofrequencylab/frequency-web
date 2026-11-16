// The ONE inline analytics script the root layout puts in <head>, as a string (SCAN-1243).
//
// components/analytics/google-analytics.tsx renders it; the proxy hashes it for the nonce-based
// Content-Security-Policy (lib/security/csp-nonce.ts). Both must agree byte for byte, so the choice
// between the two shapes lives here and neither caller rebuilds it.
//
// The measurement id is read at MODULE LOAD and the deployment at CALL time, exactly as the
// component did before this file existed (its tests stub them in that order).

import { gaBootstrapScript } from '@/lib/consent/cookie-consent'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

/** The deployment we are running in: Vercel's VERCEL_ENV when present, NODE_ENV otherwise. */
function deployEnv(): string | undefined {
  return process.env.VERCEL_ENV || process.env.NODE_ENV
}

/** True when the Google tag may load here: a measurement id is set and this is production. */
export function googleTagEnabled(): boolean {
  return !!GA_ID && deployEnv() === 'production'
}

/** The head script for this deployment: the Google loader when the tag is on, else the
 *  first-party request-policy wrapper with Google off. Exactly one of the two is in every page. */
export function analyticsHeadScript(): string {
  return googleTagEnabled() ? gaBootstrapScript(GA_ID as string, true) : gaBootstrapScript('', true, false)
}
