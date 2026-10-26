// A LAUNCH DOOR (LIVE-800): one promise, one button, landing on the funnel's first win. The five
// doors render from lib/marketing/launch-doors.ts; a campaign points at /go/<slug> with the door's
// utm_campaign, which the proxy's first-touch cookie records on arrival. Static, public.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LAUNCH_DOORS, launchDoorBySlug } from '@/lib/marketing/launch-doors'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
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
