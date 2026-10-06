import { redirect } from 'next/navigation'
import { markAnonymousRender } from '@/lib/core/anonymous-render'

// Owner ask 2026-10-06: /sites/<slug>/<page> forwards to the same page on the Space's public profile.
// The website itself is served on the Space's own subdomain and custom domain (app/hosted).
// CACHED (LIVE-784): the forward is ISR like the rest of the site routes, so it costs no render per visit.
export const revalidate = 3600

export function generateStaticParams(): { slug: string; page: string }[] {
  return []
}

export default async function SpaceWebsitePage({ params }: { params: Promise<{ slug: string; page: string }> }) {
  markAnonymousRender()
  const { slug, page } = await params
  redirect(`/spaces/${encodeURIComponent(slug)}/${encodeURIComponent(page)}`)
}
