import { redirect } from 'next/navigation'

// SPACE PROFILE LAYOUT (legacy list editor, RETIRED — ADR-508 U3). The single-column list editor that
// used to live here is retired in favor of the ONE standard profile selector: the grid block-picker at
// ./grid, the same editor every other entity uses (components/entity-blocks/block-grid-editor.tsx),
// which writes preferences.profileLayout the live Home render reads. This route now permanently forwards
// to the grid editor so any saved bookmark / inbound link lands on the standard selector.

export default async function SpaceProfileLayoutPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/spaces/${slug}/settings/profile/grid`)
}
