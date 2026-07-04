import { redirect } from 'next/navigation'

// SPACE PROFILE GRID EDITOR (RETIRED — ADR-516 Phase D). The standalone grid block-picker that used to
// live here is replaced by the IN-RAIL Space page builder: on the Space profile ROOT (/spaces/<slug>) the
// `space.layout` ("Page") rail surface mounts the freeform rows/slots outline editor, and the page behind
// the same-route slide-over is the live WYSIWYG preview. This route now permanently forwards to the profile
// so any saved bookmark / inbound link lands on the builder in the rail.

export default async function SpaceProfileGridPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/spaces/${slug}`)
}
