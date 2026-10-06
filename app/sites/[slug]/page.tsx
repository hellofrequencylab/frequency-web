import type { Metadata } from 'next'
import { markAnonymousRender } from '@/lib/core/anonymous-render'
import { SitePage, siteMetadata } from '@/components/sites/site-page'

// The external website's HOME page. The render, the publish gate and the Coming soon fallback all live
// in components/sites/site-page.tsx, shared with the custom pages route beside this one.
// CACHED PER SPACE (PROG-E10 phase 5, LIVE-784): ISR, the app/(public) pattern. The empty
// generateStaticParams renders each site on its first visit and caches it; the `site:<slug>` tag its
// Space read carries (lib/sites/site-cache.ts) is expired by the owner's saves and the publish switch.
// markAnonymousRender keeps every viewer read on the render from reaching for cookies.
export const revalidate = 3600

export function generateStaticParams(): { slug: string }[] {
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return siteMetadata(slug)
}

export default async function SpaceWebsiteHome({ params }: { params: Promise<{ slug: string }> }) {
  markAnonymousRender()
  const { slug } = await params
  return <SitePage slug={slug} />
}
