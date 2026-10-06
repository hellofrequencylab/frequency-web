import { headers } from 'next/headers'
import { getSpaceByDomain } from '@/lib/spaces/store'
import { normalizeHost } from '@/lib/sites/host'
import type { Space } from '@/lib/spaces/types'

// THE CUSTOM-DOMAIN SITE RESOLVE (PROG-E10 phase 2). proxy.ts rewrites a listed site host to
// /hosted/<host>[/<page>] (lib/sites/host.ts). The Space is resolved by DOMAIN, through
// getSpaceByDomain, so the custom_domain plan gate applies. The route answers only when the request's
// own Host matches the path, so /hosted/<domain> typed on Frequency's host 404s rather than becoming
// a second copy of somebody's site.
export async function resolveHostedSpace(hostParam: string): Promise<Space | null> {
  const host = normalizeHost(decodeURIComponent(hostParam))
  const requestHost = normalizeHost((await headers()).get('host'))
  if (!host || host !== requestHost) return null
  return getSpaceByDomain(host)
}
