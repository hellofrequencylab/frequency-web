// WHO RUNS A DOMAIN'S DNS (PROG-E10, the foolproof Domain section). The records a client must set live
// wherever their domain's nameservers point, which is often not where they think (a domain bought at
// GoDaddy can have its DNS at Cloudflare or Squarespace). Reading the nameservers lets the Domain section
// say "open your DNS settings at Cloudflare" instead of "at your registrar". PURE matcher; the lookup
// itself is `detectDnsProvider` (server, never throws).

export interface DnsProvider {
  /** The provider's name as clients know it. */
  name: string
  /** The DNS is already Vercel's, so no records are needed at all. */
  vercel?: boolean
}

const PROVIDERS: { match: RegExp; provider: DnsProvider }[] = [
  { match: /vercel-dns\.com$/, provider: { name: 'Vercel', vercel: true } },
  { match: /ns\.cloudflare\.com$/, provider: { name: 'Cloudflare' } },
  { match: /domaincontrol\.com$/, provider: { name: 'GoDaddy' } },
  { match: /registrar-servers\.com$/, provider: { name: 'Namecheap' } },
  { match: /squarespacedns\.com$|googledomains\.com$/, provider: { name: 'Squarespace' } },
  { match: /wixdns\.net$/, provider: { name: 'Wix' } },
  { match: /porkbun\.com$/, provider: { name: 'Porkbun' } },
  { match: /hover\.com$/, provider: { name: 'Hover' } },
  { match: /awsdns-\d+\./, provider: { name: 'Amazon Route 53' } },
  { match: /ui-dns\.(com|de|org|biz)$/, provider: { name: 'IONOS' } },
  { match: /bluehost\.com$/, provider: { name: 'Bluehost' } },
  { match: /worldnic\.com$/, provider: { name: 'Network Solutions' } },
  { match: /name\.com$/, provider: { name: 'Name.com' } },
  { match: /dreamhost\.com$/, provider: { name: 'DreamHost' } },
  { match: /hostgator\.com$/, provider: { name: 'HostGator' } },
  { match: /shopify\.com$|myshopify\.com$/, provider: { name: 'Shopify' } },
]

/** Name the DNS provider from a domain's nameserver hostnames, or null when none is recognised. */
export function providerFromNameservers(nameservers: string[]): DnsProvider | null {
  for (const ns of nameservers) {
    const host = ns.trim().toLowerCase().replace(/\.$/, '')
    const hit = PROVIDERS.find((p) => p.match.test(host))
    if (hit) return hit.provider
  }
  return null
}

/** Look up `domain`'s nameservers and name the provider. Null on any failure or an unknown provider. */
export async function detectDnsProvider(domain: string): Promise<DnsProvider | null> {
  try {
    const { resolveNs } = await import('node:dns/promises')
    return providerFromNameservers(await resolveNs(domain))
  } catch {
    return null
  }
}
