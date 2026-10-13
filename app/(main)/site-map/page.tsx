import type { Metadata } from 'next'
import Link from 'next/link'
import { IndexTemplate } from '@/components/templates'
import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteMapBody, SITE_MAP } from '@/components/frequency/members/site-map/site-map-body'

// The member site map: every area of the member site and its pages, as links (the footer's "Site
// map" door). Under Frequency it is the reference's page (Site Map.html); under DAWN the same list in
// an Index shell. Not the XML sitemap, which is app/sitemap.ts at /sitemap.xml.

export const metadata: Metadata = {
  title: 'Site map',
  description: 'Every part of the member site in one place.',
  // A navigation page for members, not a search destination: kept out of the index, links followed.
  robots: { index: false, follow: true },
}

export default function SiteMapPage() {
  if (SITE_DESIGN === 'frequency') return <SiteMapBody />

  return (
    <IndexTemplate title="Site map" description="Every part of the member site in one place.">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {SITE_MAP.map((col) => (
          <nav key={col.area} aria-label={col.area}>
            <h2 className="eyebrow text-muted">{col.area}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-body-sm font-medium text-text hover:text-primary-strong">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </IndexTemplate>
  )
}
