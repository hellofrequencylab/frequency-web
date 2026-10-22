import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { loadPricingInput } from '@/lib/pricing/pricing-input'
import { getFunnelConfig, funnelSlugs } from '@/lib/marketing/funnel-config'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'

// The index of the six operator doors, so /for is a real page and not a 404. It lists each door with its
// eyebrow, headline and a one-line subhead, read from the same registry as the doors themselves.
export const revalidate = 3600

const TITLE = 'Software for coaches, studios, hosts, venues, Non Profits and networks'
const DESCRIPTION =
  'Pick the door that fits how you work. Frequency gives coaches, studios, event hosts, venues, Non Profits and networks one home for bookings, members and events in North County San Diego.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/for' },
  openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: TITLE, description: DESCRIPTION, url: '/for', type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default async function ForIndexPage() {
  const input = await loadPricingInput()
  const doors = funnelSlugs()
    .map((slug) => getFunnelConfig(slug, input))
    .flatMap((c) => (c ? [c] : []))

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <JsonLd data={[breadcrumbSchema([{ name: 'Frequency', path: '/' }, { name: 'For you', path: '/for' }])]} />
      <h1 className="text-3xl font-semibold text-text">Which door fits you?</h1>
      <p className="mt-3 text-muted">
        Every door opens the same free Space. Pick the one that sounds like your work and see what Frequency does for it.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {doors.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/for/${c.slug}`}
              className="block h-full rounded-card border border-border bg-surface p-5 transition-colors hover:bg-surface-elevated"
            >
              <span className="text-sm text-muted">{c.hero.eyebrow}</span>
              <span className="mt-1 block text-lg font-medium text-text">{c.hero.h1}</span>
              <span className="mt-2 block text-sm text-muted">{c.hero.subhead}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
