import { redirect } from 'next/navigation'

// The individual Check-in route now redirects into the unified Offerings surface, anchored to its
// section (the deeper Offerings merge). The Check-in BODY lives in ./section.tsx and is composed by
// /settings/offerings; this route stays resolvable so old links / bookmarks / tests never 404. The auth
// gate + the per-Space function gate both live on the Offerings page + the section body (which composes
// the Check-in section only for an event_space).
export default async function SpaceCheckinPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/spaces/${slug}/settings/offerings#checkin`)
}
