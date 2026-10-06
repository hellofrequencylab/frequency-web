import { describe, expect, it } from 'vitest'
import { providerFromNameservers } from './dns-provider'
import { DOMAIN_METHODS } from './domain-methods'

describe('providerFromNameservers', () => {
  it('names common providers from their nameservers', () => {
    expect(providerFromNameservers(['ns45.domaincontrol.com'])?.name).toBe('GoDaddy')
    expect(providerFromNameservers(['ada.ns.cloudflare.com.'])?.name).toBe('Cloudflare')
    expect(providerFromNameservers(['dns1.registrar-servers.com'])?.name).toBe('Namecheap')
  })

  it('knows when the DNS is already Vercel', () => {
    expect(providerFromNameservers(['ns1.vercel-dns.com'])?.vercel).toBe(true)
  })

  it('returns null for an unknown provider', () => {
    expect(providerFromNameservers(['ns1.example-dns.net'])).toBeNull()
  })
})

describe('DOMAIN_METHODS', () => {
  it('leads with the DNS method, which is live', () => {
    expect(DOMAIN_METHODS[0]).toMatchObject({ key: 'dns', available: true })
  })
})
