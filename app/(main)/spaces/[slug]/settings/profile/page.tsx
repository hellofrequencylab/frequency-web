import { redirect } from 'next/navigation'

// SPACE PROFILE LAYOUT (legacy list editor, RETIRED — ADR-508 U3, forward updated ADR-516 Phase D). The
// single-column list editor that used to live here is retired in favor of the IN-RAIL Space page builder
// (the `space.layout` rail surface on the profile root), so this route permanently forwards to the profile
// where the builder lives.

export default async function SpaceProfileLayoutPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/spaces/${slug}`)
}
