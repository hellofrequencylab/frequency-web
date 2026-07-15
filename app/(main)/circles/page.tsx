import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import type { Data } from '@/lib/page-editor/types'
import { BlockRender } from '@/lib/page-editor/block-render'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { MarketHero } from '@/components/marketplace/market-hero'
import { HERO_PRIMARY_BTN, HERO_SECONDARY_BTN } from '@/components/marketplace/hero-buttons'
import { DirectorySearch } from '@/components/ui/directory-search'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { pageContentMetadata } from '@/lib/page-content'
import { getCirclesIndexData, CONTENT_FALLBACK } from '@/lib/circles/index-data'

// The Circles index — a TEMPLATE + BLOCKS surface (PAGE-FRAMEWORK). It now opens on the SHARED
// MarketHero header (the same hero band Events / Marketplace Events / Business Spaces use) so every
// browse surface reads as one header: a centered, keyword-forward H1, the search bar IN the hero,
// and the action buttons row (Start a Circle + Manage my Circles). The search moved out of the
// CirclesToolbar block into the hero (the block now renders format + sort only, so the two search
// inputs never duplicate). The BODY is the standardized, operator-rearrangeable Circles block layout
// rendered through Puck, fed the live index data (getCirclesIndexData) via `metadata.circlesIndex`.
// Semantic DAWN tokens only, no hex, no em dashes.

const EMPTY: Data = { content: [], root: {} }

// Operator-set title/description also drive <title> + og/twitter cards (PX.2). The default title is
// the keyword-forward "Circles near you" (CONTENT-VOICE §8a: the phrase people search).
export function generateMetadata() {
  return pageContentMetadata('/circles', CONTENT_FALLBACK)
}

export default async function CirclesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; interest?: string; sort?: string; q?: string; channel?: string }>
}) {
  const circlesIndex = await getCirclesIndexData(await searchParams)
  const { content, signedIn, interests, canCreate } = circlesIndex

  // Block layout: an operator-published doc wins; else the coded default template.
  const published = await getPublishedData('circles')
  const data: Data = isRenderable(published) ? published : getTemplate('circles') ?? EMPTY

  // The action cluster, matching the Events header grammar:
  //   • Start a Circle — the full-page builder, gated behind the Crew popup (NewCircleCompose owns the
  //     canCreate rule; non-Crew get the upgrade lightbox). Shown to any signed-in member.
  //   • Manage my Circles — the Leadership hub (/lead), shown to the population that can run a circle
  //     (Crew/steward, canCreate). /lead self-scopes to the caller's own circles.
  //   • Operator CTA (PX.1) — the optional operator-set link, kept when both label + href are set.
  const actions =
    signedIn || (content.ctaLabel && content.ctaHref) ? (
      <>
        {signedIn && (
          <NewCircleCompose
            interests={interests}
            buttonLabel="Start a Circle"
            canCreate={canCreate}
            buttonClass={HERO_PRIMARY_BTN}
          />
        )}
        {canCreate && (
          <Link href="/lead" className={HERO_SECONDARY_BTN}>
            <Settings2 className="h-4 w-4" aria-hidden />
            Manage my Circles
          </Link>
        )}
        {content.ctaLabel && content.ctaHref && (
          <a href={content.ctaHref} className={HERO_SECONDARY_BTN}>
            {content.ctaLabel}
          </a>
        )}
      </>
    ) : undefined

  return (
    <div className="space-y-6">
      <MarketHero
        image={content.heroImage ?? '/images/site/group-of-friends.jpg'}
        eyebrow="Community"
        title={content.title}
        subtitle={content.description}
        search={<DirectorySearch placeholder="Search circles by name or place" />}
        action={actions}
      />

      {/* The body: the standardized, rearrangeable Circles blocks, fed the live data. */}
      <BlockRender config={config} data={data} metadata={{ circlesIndex }} />
    </div>
  )
}
