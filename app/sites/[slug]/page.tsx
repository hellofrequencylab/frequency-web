import { redirect } from 'next/navigation'

// Owner ask 2026-10-06: a visitor on Frequency sees the Space's public page (/spaces/<slug>), not the
// website render. The website moves to the Space's own subdomain and custom domain (app/hosted), so
// /sites/<slug> forwards to the public page and an old shared link still lands somewhere good.
export default async function SpaceWebsiteHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/spaces/${encodeURIComponent(slug)}`)
}
