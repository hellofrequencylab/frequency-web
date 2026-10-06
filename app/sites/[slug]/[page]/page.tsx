import { redirect } from 'next/navigation'

// Owner ask 2026-10-06: /sites/<slug>/<page> forwards to the same page on the Space's public profile.
// The website itself is served on the Space's own subdomain and custom domain (app/hosted).
export default async function SpaceWebsitePage({ params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params
  redirect(`/spaces/${encodeURIComponent(slug)}/${encodeURIComponent(page)}`)
}
