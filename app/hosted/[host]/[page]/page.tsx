import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SitePage, siteMetadata } from '@/components/sites/site-page'
import { resolveHostedSpace } from '@/lib/sites/hosted'

// One of a Space website's custom pages on the Space's own domain (PROG-E10 phase 2). proxy.ts
// rewrites `https://<domain>/<page>` here; a slug that is not a declared page 404s inside SitePage.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ host: string; page: string }>
}): Promise<Metadata> {
  const { host, page } = await params
  const space = await resolveHostedSpace(host)
  if (!space) return { title: 'Site', robots: { index: false } }
  return siteMetadata(space.slug, page)
}

export default async function HostedSitePage({
  params,
}: {
  params: Promise<{ host: string; page: string }>
}) {
  const { host, page } = await params
  const space = await resolveHostedSpace(host)
  if (!space) notFound()
  return <SitePage slug={space.slug} pageSlug={page} base="" />
}
