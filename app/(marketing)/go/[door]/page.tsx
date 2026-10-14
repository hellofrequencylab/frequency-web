// A LAUNCH DOOR (LIVE-800): one promise, one button, landing on the funnel's first win. The five
// doors render from lib/marketing/launch-doors.ts; a campaign points at /go/<slug> with the door's
// utm_campaign, which the proxy's first-touch cookie records on arrival. Static, public.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LAUNCH_DOORS, launchDoorBySlug } from '@/lib/marketing/launch-doors'
import { buttonClasses } from '@/components/ui/button'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FnHero } from '@/components/frequency/site/pages/funnel/parts'

export const dynamicParams = false

export function generateStaticParams(): { door: string }[] {
  return LAUNCH_DOORS.map((d) => ({ door: d.slug }))
}

type Params = { params: Promise<{ door: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const door = launchDoorBySlug((await params).door)
  if (!door) return { title: 'Not found' }
  const path = `/go/${door.slug}`
  const title = `${door.name} · Frequency`
  return {
    title: door.promise,
    description: door.detail,
    alternates: { canonical: path },
    // A campaign landing, not a search page: the SEO pages (/calm-down-fast and the rest) own the
    // queries, so a door never competes with them in the index.
    robots: { index: false, follow: true },
    openGraph: { ...OG_SITE, title, description: door.detail, url: path, images: ROOT_OG_IMAGES },
    twitter: { card: 'summary_large_image', title, description: door.detail },
  }
}

export default async function LaunchDoorPage({ params }: Params) {
  const door = launchDoorBySlug((await params).door)
  if (!door) notFound()

  // The Frequency design (ADR-1737): the same one promise and one button, as the design's hero.
  if (SITE_DESIGN === 'frequency') {
    return (
      <FnHero center full kicker={door.name} title={door.promise} lede={door.detail}>
        <div className="ctas">
          <Link className="btn fq-iri-btn" href={door.buttonHref}>
            {door.buttonLabel} →
          </Link>
        </div>
      </FnHero>
    )
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center px-4 py-16 text-center sm:py-24">
      <p className="eyebrow text-primary-strong">{door.name}</p>
      <h1 className="mt-3 text-page-title-lg font-semibold text-text">{door.promise}</h1>
      <p className="mt-4 max-w-lg text-lead text-muted">{door.detail}</p>
      <Link href={door.buttonHref} className={buttonClasses('primary', 'md', 'mt-8')}>
        {door.buttonLabel}
      </Link>
    </section>
  )
}
