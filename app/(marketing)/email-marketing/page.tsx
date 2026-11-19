// /email-marketing (LIVE-2483): the Email Marketing builder. A visitor writes a first email signed out and signs in at
// the end; a member saves it straight away as a draft on their newest Space. Nothing is ever sent from here. ?done=1 is
// the landing after the hand-over (app/finish/[feature]). The body lives in components/frequency/site/pages/feature-builder.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { EmailMarketingPage } from '@/components/frequency/site/pages/feature-builder/email-marketing'
import { getMyProfileId } from '@/lib/auth'
import { listOwnedSpaces } from '@/lib/launch/spaces-io'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.emailMarketing)

export default async function EmailMarketingRoute({ searchParams }: { searchParams: Promise<{ done?: string; e?: string }> }) {
  const params = await searchParams
  const profileId = await getMyProfileId()
  // The draft goes on the owner's newest Space, so that is the one the page names and the one ?done=1 opens.
  const newest = profileId ? (await listOwnedSpaces(profileId)).at(-1) : undefined
  const done = newest && params.done === '1' ? { liveHref: `/spaces/${newest.slug}/marketing` } : null
  const error = params.e === 'save' || params.e === 'draft' ? params.e : null
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.emailMarketing)} />
      <EmailMarketingPage signedIn={!!profileId} done={done} error={error} spaceName={newest?.name} />
    </>
  )
}
