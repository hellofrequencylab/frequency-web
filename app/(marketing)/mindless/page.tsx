// The public Mindless timer (LIVE-805): a 5-minute breathing session anyone can run signed out.
// The Calm down fast door lands here (LIVE-800). Static: the page is the client timer and its words.
import type { Metadata } from 'next'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { FnColumn, FnHero } from '@/components/frequency/site/pages/funnel/parts'
import { FrequencyMindlessTimer } from '@/components/frequency/site/pages/funnel/mindless-timer'

const PATH = '/mindless'
const TITLE = 'A 5-minute breathing timer, no account needed'
const DESCRIPTION =
  'Five calm minutes, right now. Follow the rings: breathe in for five, out for five. Free, no sign-up, nothing to install.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { ...OG_SITE, title: `${TITLE} · Frequency`, description: DESCRIPTION, url: PATH, images: ROOT_OG_IMAGES },
  twitter: { card: 'summary_large_image', title: `${TITLE} · Frequency`, description: DESCRIPTION },
}

export default function MindlessPublicPage() {
  return (
    <>
      <FnHero
        center
        kicker="Mindless"
        title="Five minutes. Just breathe."
        lede="Breathe in as the rings grow and let go as they settle. When the clock ends, you are done."
      />
      <FnColumn label="02 Timer">
        <FrequencyMindlessTimer />
      </FnColumn>
    </>
  )
}
