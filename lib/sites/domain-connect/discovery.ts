// DOMAIN CONNECT DISCOVERY (LIVE-780). Can this domain's DNS provider apply Frequency's template in
// one click? Three short reads, each allowed to fail:
//   1. the `_domainconnect.<domain>` TXT record names the provider's Domain Connect API host;
//   2. https://<that host>/v2/<domain>/settings gives the provider's name, urlSyncUX and urlAPI;
//   3. GET {urlAPI}/v2/domainTemplates/providers/{providerId}/services/{serviceId} says whether the
//      provider has onboarded Frequency's template (200) or not (anything else).
// Then, with a signing key configured, it builds the signed apply URL.
//
// Server-only. NEVER throws, uses short timeouts and refuses anything but plain https to a named
// reviewed provider host, so an unreviewed TXT destination produces { supported: false }, and the Domain
// section shows the copy-records steps instead.

import type { KeyObject } from 'node:crypto'
import { DC_PROVIDER_ID, DC_SERVICE_ID } from './constants'
import { buildApplyUrl } from './apply-url'
import { loadSigningKey } from './signer'

const TIMEOUT_MS = 3000

export interface DomainConnectSettings {
  providerName: string
  urlSyncUX: string
  urlAPI: string
}

export type OneClickConnect = { supported: false } | { supported: true; providerName: string; applyUrl: string }

// Exact reviewed provider bases. Discovery TXT is domain-owner controlled; accepting arbitrary
// HTTPS names would let it steer server requests into DNS-controlled private destinations.
const PROVIDERS = [
  { discovery: ['https://domainconnect.godaddy.com', 'https://domainconnect.api.godaddy.com'], api: 'https://domainconnect.api.godaddy.com', ux: 'https://dcc.godaddy.com/manage' },
  { discovery: ['https://api.cloudflare.com/client/v4/dns/domainconnect'], api: 'https://api.cloudflare.com/client/v4/dns/domainconnect', ux: 'https://dash.cloudflare.com/domainconnect' },
] as const

/** Canonical reviewed HTTPS base, or null. No suffix/wildcard hosts or arbitrary paths. */
export function safeHttpsBase(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 512 || /[\\%?#]/.test(raw)) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (/^https:\/\/[^/]*:/i.test(raw.trim())) return null
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null
  // Reject dot-segment normalization rather than silently changing the requested path.
  if (/\/(?:\.\.?)(?:\/|$)/.test(raw)) return null
  const base = `${url.origin}${url.pathname}`.replace(/\/+$/, '')
  return PROVIDERS.some(p => [...p.discovery, p.api, p.ux].some(value => value === base)) ? base : null
}

function apiProvider(raw: unknown) {
  const base = safeHttpsBase(raw)
  return PROVIDERS.find(p => p.discovery.some(d => d === base) || p.api === base)
}

/** The Domain Connect API base named by a `_domainconnect` TXT record's strings, or null. */
export function apiBaseFromTxt(records: string[][]): string | null {
  for (const chunks of records) {
    const raw = chunks.join('').trim()
    if (/^http:\/\//i.test(raw)) continue
    const value = raw.replace(/^https:\/\//i, '')
    if (!value) continue
    const base = safeHttpsBase(`https://${value}`)
    if (base && apiProvider(base)) return base
  }
  return null
}

/** Pick the fields Frequency needs out of a provider's settings JSON, or null when it is unusable. */
export function parseSettings(json: unknown): DomainConnectSettings | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  const urlSyncUX = safeHttpsBase(o.urlSyncUX)
  const urlAPI = safeHttpsBase(o.urlAPI)
  const rawName = typeof o.providerDisplayName === 'string' && o.providerDisplayName.trim() ? o.providerDisplayName : o.providerName
  const providerName = typeof rawName === 'string' ? rawName.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) : ''
  if (!urlSyncUX || !urlAPI || !providerName || !PROVIDERS.some(p => p.api === urlAPI && p.ux === urlSyncUX)) return null
  return { providerName, urlSyncUX, urlAPI }
}

async function getJson(url: string): Promise<{ ok: boolean; json: unknown }> {
  // Revalidate at the actual network boundary, including direct templateSupported callers.
  const parsed = new URL(url)
  const allowed = PROVIDERS.some(p => [...p.discovery, p.api].some(base => {
    if (!url.startsWith(`${base}/v2/`)) return false
    const suffix = url.slice(base.length)
    return /^\/v2\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\/settings$/i.test(suffix) || suffix === `/v2/domainTemplates/providers/${encodeURIComponent(DC_PROVIDER_ID)}/services/${encodeURIComponent(DC_SERVICE_ID)}`
  }))
  if (!allowed || parsed.search || parsed.hash || parsed.username || parsed.password || parsed.port) return { ok: false, json: null }
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // A 404 with an HTML body is just "no".
  }
  return { ok: res.ok, json }
}

/** Steps 1 and 2: the provider's Domain Connect settings for `domain`, or null. Never throws. */
export async function readDomainConnectSettings(domain: string): Promise<DomainConnectSettings | null> {
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(domain) || domain.includes('..')) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const { resolveTxt } = await import('node:dns/promises')
    const txt = await Promise.race([
      resolveTxt(`_domainconnect.${domain}`),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
      }),
    ])
    clearTimeout(timer)
    const api = apiBaseFromTxt(txt)
    if (!api) return null
    const res = await getJson(`${api}/v2/${encodeURIComponent(domain)}/settings`)
    const settings = res.ok ? parseSettings(res.json) : null
    const provider = apiProvider(api)
    return settings && provider && settings.urlAPI === provider.api && settings.urlSyncUX === provider.ux ? settings : null
  } catch {
    clearTimeout(timer)
    return null
  }
}

/** Step 3: has the provider onboarded Frequency's template? Never throws. */
export async function templateSupported(urlAPI: string): Promise<boolean> {
  try {
    const base = safeHttpsBase(urlAPI)
    if (!base || !PROVIDERS.some(p => p.api === base)) return false
    const res = await getJson(
      `${base}/v2/domainTemplates/providers/${encodeURIComponent(DC_PROVIDER_ID)}/services/${encodeURIComponent(DC_SERVICE_ID)}`,
    )
    return res.ok
  } catch {
    return false
  }
}

/** The whole answer for the Domain section: a provider name and signed apply URL, or unsupported.
 *  Unsupported, with no network call at all, when the signing key is missing. Never throws. */
export async function findOneClickConnect(input: {
  domain: string
  variables: Record<string, string>
  redirectUri: string
  state: string
  privateKey?: KeyObject | null
}): Promise<OneClickConnect> {
  const privateKey = input.privateKey === undefined ? loadSigningKey() : input.privateKey
  if (!privateKey) return { supported: false }
  const settings = await readDomainConnectSettings(input.domain)
  if (!settings || !(await templateSupported(settings.urlAPI))) return { supported: false }
  try {
    const applyUrl = buildApplyUrl({ ...input, urlSyncUX: settings.urlSyncUX, privateKey })
    return { supported: true, providerName: settings.providerName, applyUrl }
  } catch {
    return { supported: false }
  }
}
