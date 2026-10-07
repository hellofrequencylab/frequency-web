// The public Mindless timer (LIVE-805): a 5-minute breathing session anyone can run signed out.
// The Calm down fast door lands here (LIVE-800). Static: the page is the client timer and its words.
import type { Metadata } from 'next'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { PublicTimer } from './public-timer'

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
    <section className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      <header className="mb-8 text-center">
        <p className="eyebrow text-primary-strong">Mindless</p>
        <h1 className="mt-2 text-page-title font-semibold text-text">Five minutes. Just breathe.</h1>
        <p className="mt-3 text-body text-muted">
          Breathe in as the rings grow and let go as they settle. When the clock ends, you are done.
        </p>
      </header>
      <PublicTimer />
    </section>
  )
}
