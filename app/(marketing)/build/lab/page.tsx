// /build/lab (was /lab, which now 308s here): The Lab, the 2028 third-space plan, for partners. LINK-ONLY (owner 2026-11-17): noindex, out of
// the nav and app/sitemap.ts, like /how. The body is the block template the old /the-lab page rendered
// (lib/page-editor/templates/the-lab.ts), which stayed in the repo when /the-lab merged away
// (2026-10-14). /the-lab itself keeps its permanent redirect to /about.
//
// Not an EDITABLE_PAGES slug: the words live in the template, so check:render-path does not count it.
import type { Metadata } from 'next'
import type { Data } from '@/lib/page-editor/types'
import { BlockRender } from '@/lib/page-editor/block-render'
import { platformConfig } from '@/lib/page-editor/platform-config'
import { data as theLab } from '@/lib/page-editor/templates/the-lab'
import { isWellFormed } from '@/lib/page-editor/templates/well-formed'
import { LINK_ONLY_ROBOTS } from '@/lib/seo/link-only'
import { PrivatePageTracker } from '@/components/frequency/site/shell/private-page-tracker'

export const revalidate = 3600

const TITLE = 'The Lab'
const DESCRIPTION = 'The Lab is a third space the Frequency community is planning for 2028. Nothing is bookable yet.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: LINK_ONLY_ROBOTS,
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/build/lab', type: 'website', siteName: 'Frequency', images: ['/images/site/lab-thermal.jpg'] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

const EMPTY: Data = { content: [], root: {} }

export default function LabPage() {
  const data: Data = isWellFormed(theLab) ? theLab : EMPTY
  return (
    <>
      <BlockRender config={platformConfig} data={data} metadata={{}} />
      <PrivatePageTracker page="/build/lab" />
    </>
  )
}
