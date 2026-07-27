import { describe, it, expect } from 'vitest'
import nextConfig from '../../next.config'
import { funnelSlugs } from './funnel-config'
import { PERSONA_LOADOUTS, personaPath } from '../pricing/pricing-page'

// A next.config redirect is evaluated BEFORE routing, so a rule whose `source` matches a real page
// silently replaces that page. There is no build error and no test failure anywhere else — the route
// still exists, it is just unreachable.
//
// That is exactly what happened to the operator funnel doors. Rules were written for a short-slug
// rename (/for/coaches, /for/hosts, /for/communities) that lib/marketing/funnel-config.ts never
// adopted, so /for/coaches-and-healers redirected to a slug that is not in the registry (a 404 under
// `dynamicParams = false`) and /for/event-hosts + /for/community-builders bounced to /pricing — the
// page whose cards link to them. Three of the five doors on the public pricing page were dead, and
// all three are advertised in app/sitemap.ts, so Search Console was being handed a 404 and two
// redirects for URLs we submitted ourselves.
//
// These lock the invariant in both directions.

type Redirect = { source: string; destination: string; permanent?: boolean }

async function redirects(): Promise<Redirect[]> {
  const fn = nextConfig.redirects
  if (typeof fn !== 'function') return []
  return (await fn.call(nextConfig)) as Redirect[]
}

describe('the /for funnel doors are reachable', () => {
  it('no redirect shadows a live funnel slug', async () => {
    const live = new Set(funnelSlugs().map((s) => `/for/${s}`))
    const shadowing = (await redirects()).filter((r) => live.has(r.source))
    expect(shadowing.map((r) => `${r.source} -> ${r.destination}`)).toEqual([])
  })

  it('every persona card on /pricing points at a slug the registry actually serves', () => {
    const registry = new Set(funnelSlugs())
    const broken = PERSONA_LOADOUTS.filter((p) => !registry.has(p.slug)).map((p) => p.slug)
    expect(broken).toEqual([])
  })

  it('every /for redirect that remains points somewhere real, and never at a retired slug', async () => {
    const registry = new Set(funnelSlugs())
    for (const r of (await redirects()).filter((x) => x.source.startsWith('/for/'))) {
      // The source must be a RETIRED slug (not in the registry) — otherwise it is shadowing.
      expect(registry.has(r.source.replace('/for/', ''))).toBe(false)
      // And the destination must not be a dangling /for/<slug> the registry cannot serve.
      if (r.destination.startsWith('/for/')) {
        expect(registry.has(r.destination.replace('/for/', ''))).toBe(true)
      }
    }
  })

  it('personaPath composes the path the registry + sitemap agree on', () => {
    for (const slug of funnelSlugs()) expect(personaPath(slug)).toBe(`/for/${slug}`)
  })
})
