import type { Metadata } from 'next'
import { SitePage, siteMetadata } from '@/components/sites/site-page'

// The external website's HOME page. The render, the publish gate and the Coming soon fallback all live
// in components/sites/site-page.tsx, shared with the custom pages route beside this one.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return siteMetadata(slug)
}

export default async function SpaceWebsiteHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <SitePage slug={slug} />
}
