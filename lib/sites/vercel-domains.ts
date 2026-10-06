// THE VERCEL DOMAIN CLIENT for Space websites (PROG-E10, the in-app Domain section). A Space owner
// connects their own domain from the Space's Page panel; this adds it (and its www twin, redirecting to
// the apex) to the Frequency Vercel project, reads back what DNS records the owner must set at their
// registrar, and removes it again. Server-only: it carries the Vercel API token.
//
// CONFIG: VERCEL_API_TOKEN (a Vercel access token with access to the team), VERCEL_PROJECT_ID and
// VERCEL_TEAM_ID. With any of them missing, `vercelDomainsConfigured()` is false and the Domain section
// still saves the domain and shows the standard records, saying hosting is not connected yet, so
// nothing fails silently.

import { detectDnsProvider } from './dns-provider'

const API = 'https://api.vercel.com'

/** Vercel's documented defaults, shown when the API gives no recommendation. */
export const DEFAULT_APEX_A = '76.76.21.21'
export const DEFAULT_WWW_CNAME = 'cname.vercel-dns.com'

export interface DnsRecord {
  type: 'A' | 'CNAME' | 'TXT'
  /** The record's host as a registrar labels it: `@` for the domain itself, `www`, or a subdomain. */
  name: string
  value: string
  /** Why this record is needed, in plain words. */
  purpose: string
}

export interface DomainStatus {
  /** The domain is attached to the Frequency Vercel project. */
  attached: boolean
  /** Vercel has verified the owner controls the domain. */
  verified: boolean
  /** DNS points at Vercel (false until the A / CNAME records are set and have spread). */
  dnsReady: boolean
  /** What the owner should set at their registrar. */
  records: DnsRecord[]
  /** A plain-English problem to show, when something went wrong talking to Vercel. */
  problem?: string
  /** Who runs the domain's DNS, read from its nameservers, so the steps can name it. */
  provider?: string | null
  /** The domain's DNS is already Vercel's, so no records are needed. */
  providerIsVercel?: boolean
}

interface VercelConfig {
  token: string
  projectId: string
  teamId: string
}

function config(): VercelConfig | null {
  const token = process.env.VERCEL_API_TOKEN?.trim()
  const projectId = process.env.VERCEL_PROJECT_ID?.trim()
  const teamId = process.env.VERCEL_TEAM_ID?.trim()
  if (!token || !projectId || !teamId) return null
  return { token, projectId, teamId }
}

/** Can the app talk to Vercel? When false, the owner adds the domain by hand (see the panel copy). */
export function vercelDomainsConfigured(): boolean {
  return config() !== null
}

async function call(
  cfg: VercelConfig,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${API}${path}${sep}teamId=${encodeURIComponent(cfg.teamId)}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    // An empty body (a DELETE) is fine.
  }
  return { ok: res.ok, status: res.status, json }
}

function errorCode(json: Record<string, unknown>): string {
  const err = json.error as { code?: string } | undefined
  return err?.code ?? ''
}

/** The registrar's name for a host under `apex`: `@` for the apex itself, else the leading labels. */
export function recordName(host: string, apex: string): string {
  if (host === apex) return '@'
  return host.endsWith(`.${apex}`) ? host.slice(0, -(apex.length + 1)) : host
}

/** The records an owner sets for `domain`: an A record for the apex and a CNAME for www, plus any TXT
 *  ownership records Vercel asks for. PURE, so the panel can show the defaults with no API at all. */
export function recordsFor(
  domain: string,
  opts: { apexA?: string; wwwCname?: string; verification?: { type: string; domain: string; value: string }[] } = {},
): DnsRecord[] {
  const records: DnsRecord[] = [
    { type: 'A', name: '@', value: opts.apexA ?? DEFAULT_APEX_A, purpose: 'Points your domain at your Frequency website.' },
    { type: 'CNAME', name: 'www', value: opts.wwwCname ?? DEFAULT_WWW_CNAME, purpose: 'Sends www to the same website.' },
  ]
  for (const v of opts.verification ?? []) {
    if (v.type !== 'TXT') continue
    records.push({ type: 'TXT', name: recordName(v.domain, domain), value: v.value, purpose: 'Proves you own the domain.' })
  }
  return records
}

/** Attach `domain` and `www.<domain>` (redirecting to the apex) to the project. Idempotent: a domain
 *  already on this project counts as attached. */
export async function addSiteDomain(domain: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = config()
  if (!cfg) return { ok: false, error: 'not-configured' }
  const base = `/v10/projects/${encodeURIComponent(cfg.projectId)}/domains`
  for (const body of [{ name: domain }, { name: `www.${domain}`, redirect: domain, redirectStatusCode: 308 }]) {
    const res = await call(cfg, 'POST', base, body)
    if (res.ok) continue
    const code = errorCode(res.json)
    // Already on this project: nothing to do.
    if (res.status === 409 && code === 'domain_already_in_use' && (res.json.error as { projectId?: string })?.projectId === cfg.projectId) continue
    if (res.status === 409 && code === 'domain_already_exists') continue
    if (res.status === 409) return { ok: false, error: 'in-use' }
    return { ok: false, error: code || `vercel-${res.status}` }
  }
  return { ok: true }
}

/** Remove `domain` and its www twin from the project. Missing domains are fine. */
export async function removeSiteDomain(domain: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = config()
  if (!cfg) return { ok: false, error: 'not-configured' }
  for (const name of [`www.${domain}`, domain]) {
    const res = await call(cfg, 'DELETE', `/v9/projects/${encodeURIComponent(cfg.projectId)}/domains/${encodeURIComponent(name)}`)
    if (!res.ok && res.status !== 404) return { ok: false, error: errorCode(res.json) || `vercel-${res.status}` }
  }
  return { ok: true }
}

/** Read where `domain` stands: attached, verified, DNS pointed, and the records to set. Never throws:
 *  an unreachable API returns the default records with a `problem`. */
export async function siteDomainStatus(domain: string): Promise<DomainStatus> {
  const [base, provider] = await Promise.all([readStatus(domain), detectDnsProvider(domain)])
  return { ...base, provider: provider?.name ?? null, providerIsVercel: provider?.vercel === true }
}

async function readStatus(domain: string): Promise<DomainStatus> {
  const cfg = config()
  if (!cfg) {
    return {
      attached: false,
      verified: false,
      dnsReady: false,
      records: recordsFor(domain),
      problem: 'Hosting is not connected yet, so Frequency cannot add your domain on its own.',
    }
  }
  try {
    const project = `/v9/projects/${encodeURIComponent(cfg.projectId)}/domains/${encodeURIComponent(domain)}`
    let attachedRes = await call(cfg, 'GET', project)
    if (attachedRes.ok && attachedRes.json.verified !== true) {
      // Ask Vercel to re-check ownership; a TXT record set since the last look is picked up here.
      const verify = await call(cfg, 'POST', `${project}/verify`)
      if (verify.ok) attachedRes = verify
    }
    const configRes = await call(cfg, 'GET', `/v6/domains/${encodeURIComponent(domain)}/config`)

    const attached = attachedRes.ok
    const verified = attached && attachedRes.json.verified === true
    const verification = (attachedRes.json.verification as { type: string; domain: string; value: string }[] | undefined) ?? []
    const ipv4 = configRes.json.recommendedIPv4 as { rank: number; value: string[] }[] | undefined
    const cname = configRes.json.recommendedCNAME as { rank: number; value: string }[] | undefined
    const apexA = ipv4?.find((r) => r.rank === 1)?.value?.[0]
    const wwwCname = cname?.find((r) => r.rank === 1)?.value?.replace(/\.$/, '')

    return {
      attached,
      verified,
      dnsReady: configRes.ok && configRes.json.misconfigured === false,
      records: recordsFor(domain, { apexA, wwwCname, verification: verified ? [] : verification }),
      problem: attached ? undefined : 'This domain is not connected to Frequency hosting yet. Press Connect again.',
    }
  } catch {
    return {
      attached: false,
      verified: false,
      dnsReady: false,
      records: recordsFor(domain),
      problem: 'Could not reach the hosting service just now. Try Check again in a minute.',
    }
  }
}
