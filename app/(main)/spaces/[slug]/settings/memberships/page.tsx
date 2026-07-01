import { redirect } from 'next/navigation'

// The individual Memberships route now redirects into the unified Offerings surface, anchored to its
// section (the deeper Offerings merge). The Memberships BODY lives in ./section.tsx and is composed by
// /settings/offerings; this route stays resolvable so old links / bookmarks / tests never 404. The auth
// gate + the per-Space function gate both live on the Offerings page + the section body.
export default async function SpaceMembershipsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/spaces/${slug}/settings/offerings#memberships`)
}
