import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPublishedSpotlight } from '@/lib/spotlight/data'
import { SpotlightPage } from '@/components/spotlight/spotlight-page'
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
  return (
    <>
      <JsonLd
        data={[
          personSchema({ name, path, image: data.profile.avatar_url }),
          breadcrumbSchema([{ name: 'Spotlight', path }]),
        ]}
      />
      <SpotlightPage data={data} />
    </>
  )
}
