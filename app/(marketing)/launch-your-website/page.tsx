// /launch-your-website (LIVE-2483): the Launch Your Website builder. A visitor names it, picks a look and writes the
// headline signed out, then signs in at the end; a member puts it live straight away on their newest Space. ?done=1 is
// the landing after the hand-over (app/finish/[feature]). The body lives in components/frequency/site/pages/feature-builder.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { LaunchYourWebsitePage } from '@/components/frequency/site/pages/feature-builder/launch-your-website'
import { getMyProfileId } from '@/lib/auth'
import { listOwnedSpaces } from '@/lib/launch/spaces-io'
import { siteSubdomainHost } from '@/lib/sites/host'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.launchWebsite)

export default async function LaunchYourWebsiteRoute({ searchParams }: { searchParams: Promise<{ done?: string; e?: string }> }) {
  const params = await searchParams
  const profileId = await getMyProfileId()
  // The website goes on the owner's newest Space, so that is the one the page names and the one ?done=1 opens.
  const newest = profileId ? (await listOwnedSpaces(profileId)).at(-1) : undefined
  const host = newest ? siteSubdomainHost(newest.slug) : null
  const done = newest && params.done === '1' ? { liveHref: host ? `https://${host}` : `/sites/${newest.slug}` } : null
  const error = params.e === 'save' || params.e === 'draft' ? params.e : null
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.launchWebsite)} />
      <LaunchYourWebsitePage signedIn={!!profileId} done={done} error={error} spaceName={newest?.name} />
    </>
  )
}
