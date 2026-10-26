// /themes/midnight/demo (LIVE-1382): the sample Midnight website the feature page's live preview opens. Static,
// anonymous and kept out of search; it has no marketing chrome so the preview frame shows only the site.
import type { Metadata } from 'next'
import { MIDNIGHT_FONT_CLASS } from '@/components/sites/midnight-fonts'
import { MidnightDemo } from '@/components/sites/midnight-demo'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Midnight demo site',
  description: 'A sample Midnight website with placeholder content.',
  robots: { index: false, follow: false },
}

export default function MidnightDemoPage() {
  return (
    <div className={MIDNIGHT_FONT_CLASS}>
      <MidnightDemo />
    </div>
  )
}
