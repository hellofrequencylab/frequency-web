// /create-a-space: the marketing funnel's second step. A visitor builds their Space here, signed out, and watches
// their website and Spotlight take shape; the account comes at the last step. Static: the kit arrives as ?kit= and
// is read on the client. The markup lives in components/frequency/site/pages/create-space.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { CreateSpaceStudio } from '@/components/frequency/site/pages/create-space/create-space-studio'
import { Closing, DayOne, FreeToOperate, Questions, SoundFamiliar } from '@/components/frequency/site/pages/create-space/create-space-sections'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.createSpace)

export default function CreateASpacePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.createSpace)} />
      <CreateSpaceStudio />
      <SoundFamiliar />
      <DayOne />
      <FreeToOperate />
      <Questions />
      <Closing />
    </>
  )
}
