// A site is live when its address loads (VLS-04). Attaching the free subdomain to the Vercel project is
// a request, not a result: the certificate follows a little later. So a freshly published starter site is
// 'finishing' until the address answers 200, and only then 'live'. The team rule: never call a site live
// until its URL loads. Server-only, relative imports only so a probe can run it under node.

import { siteSubdomainHost } from './host.ts'

export type SiteAddressState = 'live' | 'finishing'

export interface SiteAddressDeps {
  fetchImpl?: typeof fetch
  /** Give up on one look at the address after this many milliseconds. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 4000

/** 'live' only when `https://<host>/` answers 200 now. A refusal, a redirect, a timeout, a certificate error
 *  or any throw is 'finishing': the address is not ready, which is a state, not a failure. */
export async function siteAddressState(host: string | null, deps: SiteAddressDeps = {}): Promise<SiteAddressState> {
  if (!host) return 'finishing'
  const doFetch = deps.fetchImpl ?? fetch
  try {
    const res = await doFetch(`https://${host}/`, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
    return res.status === 200 ? 'live' : 'finishing'
  } catch {
    return 'finishing'
  }
}

/** The state of a Space's free website address, by slug. A slug that cannot be a subdomain (reserved or
 *  invalid) has no free address, so it is never 'live' from here; its /sites address is the other door. */
export function starterSiteState(slug: string, deps: SiteAddressDeps = {}): Promise<SiteAddressState> {
  return siteAddressState(siteSubdomainHost(slug), deps)
}

export type SiteAddressAttach = (host: string) => Promise<{ ok: true } | { ok: false; error: string }>

/** Ask Vercel to attach `<slug>.frequencylocal.com`. Best effort: it never throws, and the result says
 *  whether the request landed so the caller can log a miss (every fail-safe needs a gate that notices it
 *  fired). A slug with no free address resolves `skipped`. */
export async function requestSiteAddress(
  slug: string,
  attach: SiteAddressAttach,
): Promise<{ host: string; requested: true } | { host: string | null; requested: false; error: string }> {
  const host = siteSubdomainHost(slug)
  if (!host) return { host: null, requested: false, error: 'no-free-address' }
  try {
    const attached = await attach(host)
    return attached.ok ? { host, requested: true } : { host, requested: false, error: attached.error }
  } catch (err) {
    return { host, requested: false, error: err instanceof Error ? err.message : 'attach-failed' }
  }
}
