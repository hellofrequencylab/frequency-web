import type { Metadata } from 'next'
import { markAnonymousRender } from '@/lib/core/anonymous-render'
import { notFound } from 'next/navigation'
import { SitePage, siteMetadata } from '@/components/sites/site-page'
import { resolveHostedSpace } from '@/lib/sites/hosted'
import { SPOTLIGHT_PAGE } from '@/lib/sites/host'
import { HostedSpotlightPage, hostedSpotlightMetadata } from '@/components/spotlight/hosted-spotlight'

// One of a Space website's custom pages on the Space's own domain (PROG-E10 phase 2). proxy.ts
// rewrites `https://<domain>/<page>` here; a slug that is not a declared page 404s inside SitePage.
// CACHED PER SPACE (PROG-E10 phase 5, LIVE-784): ISR, the app/(public) pattern. The empty
// generateStaticParams renders each site on its first visit and caches it; the `site:<slug>` tag its
// Space read carries (lib/sites/site-cache.ts) is expired by the owner's saves and the publish switch.
// markAnonymousRender keeps every viewer read on the render from reaching for cookies.
// `spotlight` is the Space's Spotlight when this host serves it (LIVE-855, components/spotlight/hosted-spotlight.tsx),
// and otherwise falls through to SitePage like any page.
export const revalidate = 3600

export function generateStaticParams(): { host: string; page: string }[] {
  return []
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ host: string; page: string }>
}): Promise<Metadata> {
  const { host, page } = await params
  const space = await resolveHostedSpace(host)
  if (!space) return { title: 'Site', robots: { index: false } }
  const spotlight = page === SPOTLIGHT_PAGE ? await hostedSpotlightMetadata(host, space) : null
  return spotlight ?? siteMetadata(space.slug, page)
}

export default async function HostedSitePage({
  params,
}: {
  params: Promise<{ host: string; page: string }>
}) {
  markAnonymousRender()
  const { host, page } = await params
  const space = await resolveHostedSpace(host)
  if (!space) notFound()
  if (page === SPOTLIGHT_PAGE) {
    const spotlight = await HostedSpotlightPage({ host, space })
    if (spotlight) return spotlight
  }
  return <SitePage slug={space.slug} pageSlug={page} base="" />
}
