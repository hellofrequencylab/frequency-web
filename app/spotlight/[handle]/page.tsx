import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPublishedSpotlight } from '@/lib/spotlight/data'
import { SpotlightShell } from '@/components/spotlight/spotlight-shell'
import { MemberProfileModules } from '@/components/widgets/member-profile/member-profile-modules'
import { defaultMemberLayout } from '@/lib/entity-blocks/context'
import { mergeEntityLayout } from '@/lib/entity-blocks/layout'
import { JsonLd } from '@/components/json-ld'
import { personSchema, breadcrumbSchema } from '@/lib/jsonld'

// PUBLIC, top-level route (outside the auth-gated (main) group) so a signed-out
// visitor or non-member can open a shared link. Per-request + fail-closed: a page
// that is not explicitly published 404s (no "not public yet" copy to police).
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const data = await getPublishedSpotlight(handle)
  if (!data) return { title: 'Spotlight', robots: { index: false } }
  const name = data.profile.display_name || `@${data.profile.handle}`
  const description = data.profile.bio ?? `${name} on Frequency`
  const path = `/spotlight/${data.profile.handle}`
  return {
    title: `${name} · Frequency`,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'profile',
      url: path,
      title: name,
      description,
      images: data.profile.avatar_url ? [data.profile.avatar_url] : undefined,
    },
  }
}

export default async function SpotlightRoute({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const data = await getPublishedSpotlight(handle)
  if (!data) notFound()
  const name = data.profile.display_name || `@${data.profile.handle}`
  const path = `/spotlight/${data.profile.handle}`

  // ADR-508 U3 LIVE CUTOVER: the block body now renders through the MODULE ENGINE (the block-picker
  // grid), NOT Puck. The identity header + theme + background + join CTA stay in the shared SpotlightShell
  // (unchanged look); only the body swaps to <MemberProfileModules>. REVERSIBLE: nothing deletes
  // meta.spotlight (the stored Puck layout) — reverting is a one-line swap back to <SpotlightPage>.
  // The EFFECTIVE GRID: the fresh member default with the member's saved grid (meta.entityGrid, read into
  // data.grid) merged over it. FAIL-SAFE: a null saved grid leaves the fresh default. `showBio={false}`:
  // the `about` block renders the bio, so the header must not repeat it.
  const grid = mergeEntityLayout(defaultMemberLayout(), data.grid, 'member')
  return (
    <>
      <JsonLd
        data={[
          personSchema({ name, path, image: data.profile.avatar_url }),
          breadcrumbSchema([{ name: 'Spotlight', path }]),
        ]}
      />
      <SpotlightShell data={data} showJoinCta showBio={false}>
        <MemberProfileModules member={data} grid={grid} />
      </SpotlightShell>
    </>
  )
}
