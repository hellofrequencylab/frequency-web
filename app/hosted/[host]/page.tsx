import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SitePage, siteMetadata } from '@/components/sites/site-page'
import { resolveHostedSpace } from '@/lib/sites/hosted'

// A Space website's HOME page on the Space's own domain (PROG-E10 phase 2). proxy.ts rewrites
// `https://<domain>/` here; the render is the same SitePage /sites/<slug> uses, with links off the
// domain root.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const { host } = await params
  const space = await resolveHostedSpace(host)
  if (!space) return { title: 'Site', robots: { index: false } }
  return siteMetadata(space.slug)
}

export default async function HostedSiteHome({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params
  const space = await resolveHostedSpace(host)
  if (!space) notFound()
  return <SitePage slug={space.slug} base="" />
}
