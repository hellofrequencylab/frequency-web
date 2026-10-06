import { redirect } from 'next/navigation'
import { markAnonymousRender } from '@/lib/core/anonymous-render'

// Owner ask 2026-10-06: a visitor on Frequency sees the Space's public page (/spaces/<slug>), not the
// website render. The website moves to the Space's own subdomain and custom domain (app/hosted), so
// /sites/<slug> forwards to the public page and an old shared link still lands somewhere good.
// CACHED (LIVE-784): the forward is ISR like the rest of the site routes, so it costs no render per visit.
export const revalidate = 3600

export function generateStaticParams(): { slug: string }[] {
  return []
}

export default async function SpaceWebsiteHome({ params }: { params: Promise<{ slug: string }> }) {
  markAnonymousRender()
  const { slug } = await params
  redirect(`/spaces/${encodeURIComponent(slug)}`)
}
