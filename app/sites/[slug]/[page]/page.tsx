import type { Metadata } from 'next'
import { SitePage, siteMetadata } from '@/components/sites/site-page'

// One of the external website's custom pages (the Space's operator-defined pages, the same nav the
// profile shows). A slug that is not a declared page 404s inside SitePage.
export const dynamic = 'force-dynamic'

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
  const { slug, page } = await params
  return <SitePage slug={slug} pageSlug={page} />
}
