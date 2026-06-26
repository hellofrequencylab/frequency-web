import Link from 'next/link'
import { FolderOpen } from 'lucide-react'
import { IndexTemplate } from '@/components/templates/index-template'
import { NewJourneyButton } from '@/components/studio/journey/new-journey-button'
import { PageModules } from '@/components/widgets/page-modules'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { getPageHeaderImage } from '@/lib/page-settings/store'

// The Journeys browse + build page. Module-driven (ADR-270/294): the page resolves its
// operator-editable header (ADR-180) and composes the IndexTemplate chrome, then renders
// <PageModules>, which lays out the page's blocks (the two ways in, your journeys, the community
// library) in the operator-chosen template + order. Staff arrange it from the on-page
// Settings → Layout panel (the route is registered in lib/widgets/module-routes.ts). Each block is
// a self-fetching RSC in components/widgets/journeys/*.

// Coded defaults for the operator-editable header content (ADR-180).
const CONTENT_FALLBACK = {
  title: 'Journeys',
  description: 'The library to browse and build Journeys: guided tracks of Practices across Mind, Body, Spirit, and Expression. Keep one for yourself, or share it to the open library for anyone to adopt. This season’s official Quest lives in My Quest.',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2);
// the fallback strings are the page's previous static metadata, unchanged.
export function generateMetadata() {
  return pageContentMetadata('/journeys', {
    title: 'Journeys',
    description: 'Build a journey from the practices you love and share it with the community.',
  })
}

export default async function JourneysPage() {
  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title, description, heroImage, ctaLabel, ctaHref } =
    await resolvePageContent('/journeys', CONTENT_FALLBACK)
  // The wide banner can be set from EITHER system: the new Settings → SEO & meta →
  // Header image (page_settings, ADR-268/309) OR the older page-content hero (ADR-180).
  // Prefer the new uploader so a header set there actually shows here (it was being
  // dropped — the page only read the old field). Same source crew/practices use.
  const bannerImage = (await getPageHeaderImage('/journeys')) ?? heroImage

  return (
    <IndexTemplate
      // Standardized header (PAGE-FRAMEWORK): breadcrumb -> cropped hero -> title, all from the
      // template's first-class props. The hero can be set from either the Settings header image
      // (page_settings) or the older page-content hero; both resolve into `bannerImage`.
      trail={[
        { href: '/network', label: 'Community' },
        { href: '/journeys', label: 'Journeys' },
      ]}
      heroImage={bannerImage}
      title={title}
      description={description}
      action={
        <div className="flex items-center gap-2">
          <NewJourneyButton />
          {/* The member's own management space (store / edit / publish / duplicate / delete). */}
          <Link
            href="/journeys/mine"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
          >
            <FolderOpen className="h-4 w-4" /> Your journeys
          </Link>
          {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
          {ctaLabel && ctaHref && (
            <a
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
            >
              {ctaLabel}
            </a>
          )}
        </div>
      }
    >
      <div className="max-w-4xl">
        <PageModules route="/journeys" />
      </div>
    </IndexTemplate>
  )
}
