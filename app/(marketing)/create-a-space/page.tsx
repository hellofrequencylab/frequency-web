// /create-a-space: the marketing funnel's second step. A visitor builds their Space here, signed out, and watches
// their website and Spotlight take shape; the account comes at the last step. Static: the kit arrives as ?kit= and
// is read on the client. The markup lives in components/frequency/site/pages/create-space.
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { ownedWizardEntry } from '@/lib/launch/entry-io'
import { getActiveLaunch } from '@/lib/launch/store'
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { CreateSpaceStudio } from '@/components/frequency/site/pages/create-space/create-space-studio'
import { Closing, DayOne, FreeToOperate, Questions, SoundFamiliar } from '@/components/frequency/site/pages/create-space/create-space-sections'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.createSpace)

export default async function CreateASpacePage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const params = await searchParams
  const profileId = await getMyProfileId()
  const entry = profileId ? await ownedWizardEntry(profileId, params.new === '1') : null
  if (entry) redirect(entry)
  const launch = profileId ? await getActiveLaunch(profileId) : null
  if (launch?.resume?.phase === 'launch') redirect('/launch')
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.createSpace)} />
      <CreateSpaceStudio initialResume={launch?.resume ?? null} />
      <SoundFamiliar />
      <DayOne />
      <FreeToOperate />
      <Questions />
      <Closing />
    </>
  )
}
