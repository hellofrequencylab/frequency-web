// /create-a-space (LIVE-2482): the Create a Space builder. A visitor names a Space, picks its kind and writes its line
// signed out, then signs in at the end; a member makes it straight away. ?done=1 is the landing after the hand-over
// (app/finish/[feature]) and shows the new Space with the next builders beside it. The 12-minute whole-business
// builder that lived here is /launch-your-business (LIVE-2471). The body lives in
// components/frequency/site/pages/feature-builder.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { CreateASpacePage } from '@/components/frequency/site/pages/feature-builder/create-a-space'
import { getMyProfileId } from '@/lib/auth'
import { listOwnedSpaces } from '@/lib/launch/spaces-io'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.createSpace)

export default async function CreateASpaceRoute({ searchParams }: { searchParams: Promise<{ done?: string; e?: string }> }) {
  const params = await searchParams
  const profileId = await getMyProfileId()
  // The Space the finish just made is the owner's newest one.
  const newest = profileId && params.done === '1' ? (await listOwnedSpaces(profileId)).at(-1) : undefined
  const done = newest ? { liveHref: `/spaces/${newest.slug}` } : null
  const error = params.e === 'save' || params.e === 'draft' ? params.e : null
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.createSpace)} />
      <CreateASpacePage signedIn={!!profileId} done={done} error={error} />
    </>
  )
}
