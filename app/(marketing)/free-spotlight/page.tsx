// /free-spotlight (LIVE-2481): the Free Spotlight builder. A visitor builds a personal Spotlight signed out and signs
// in at the end; a member builds it straight onto their profile. ?done=1 is the landing after the hand-over
// (app/finish/[feature]) and shows what they made with the next builders beside it. The body lives in
// components/frequency/site/pages/feature-builder.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FreeSpotlightPage } from '@/components/frequency/site/pages/feature-builder/free-spotlight'
import { getMyProfileId } from '@/lib/auth'
import { personalSpotlightHref } from '@/lib/launch/personal'
import { loadStoredProfile } from '@/lib/launch/personal-io'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.freeSpotlight)

export default async function FreeSpotlightRoute({ searchParams }: { searchParams: Promise<{ done?: string; e?: string }> }) {
  const params = await searchParams
  const profileId = await getMyProfileId()
  const profile = profileId ? await loadStoredProfile(profileId) : null
  const done = profileId && params.done === '1' ? { liveHref: personalSpotlightHref(profile?.handle) } : null
  const error = params.e === 'save' || params.e === 'draft' ? params.e : null
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.freeSpotlight)} />
      <FreeSpotlightPage signedIn={!!profileId} done={done} error={error} seedName={profile?.displayName ?? undefined} />
    </>
  )
}
