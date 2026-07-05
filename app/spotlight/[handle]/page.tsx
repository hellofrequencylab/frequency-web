import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPublishedSpotlight } from '@/lib/spotlight/data'
import { SpotlightShell } from '@/components/spotlight/spotlight-shell'
import { MemberProfileModules } from '@/components/widgets/member-profile/member-profile-modules'
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

  // ADR-522 follow-up: the GRID is now the single engine end to end. The public mini-site body renders
  // through the SAME MemberProfileModules grid path the in-app profile uses (profile-spotlight-blocks):
  // resolveRows over the member's saved meta.entityGrid, falling back to the default starter when it is
  // null — so the public page shows the member's actual builder arrangement, never Puck. The identity
  // header + theme + background + join CTA stay in the shared SpotlightShell (unchanged look); only the
  // body is the module engine. FAIL-SAFE: a null saved grid yields the fresh default (resolveRows), and
  // the content blocks source from the retained validated data.layout, so no published page goes blank.
  // The publish gate stays in getPublishedSpotlight (this route is opt-in). `showBio={false}`: the
  // `about` block renders the bio, so the header must not repeat it.
  return (
    <>
      <JsonLd
        data={[
          personSchema({ name, path, image: data.profile.avatar_url }),
          breadcrumbSchema([{ name: 'Spotlight', path }]),
        ]}
      />
      <SpotlightShell data={data} showJoinCta showBio={false}>
        <MemberProfileModules member={data} grid={data.grid} />
      </SpotlightShell>
    </>
  )
}
