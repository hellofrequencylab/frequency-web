import type { Metadata } from 'next'
import { markAnonymousRender } from '@/lib/core/anonymous-render'
import { SitePage, siteMetadata } from '@/components/sites/site-page'

// One of the external website's custom pages (the Space's operator-defined pages, the same nav the
// profile shows). A slug that is not a declared page 404s inside SitePage.
// CACHED PER SPACE (PROG-E10 phase 5, LIVE-784): ISR, the app/(public) pattern. The empty
// generateStaticParams renders each site on its first visit and caches it; the `site:<slug>` tag its
// Space read carries (lib/sites/site-cache.ts) is expired by the owner's saves and the publish switch.
// markAnonymousRender keeps every viewer read on the render from reaching for cookies.
export const revalidate = 3600

export function generateStaticParams(): { slug: string; page: string }[] {
  return []
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; page: string }>
}): Promise<Metadata> {
  const { slug, page } = await params
  return siteMetadata(slug, page)
}

export default async function SpaceWebsitePage({
  params,
}: {
  params: Promise<{ slug: string; page: string }>
}) {
  markAnonymousRender()
  const { slug, page } = await params
  return <SitePage slug={slug} pageSlug={page} />
}
