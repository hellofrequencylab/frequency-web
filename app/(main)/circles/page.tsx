import type { Data } from '@/lib/page-editor/types'
import { BlockRender } from '@/lib/page-editor/block-render'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { IndexTemplate } from '@/components/templates'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { pageContentMetadata } from '@/lib/page-content'
import { getCirclesIndexData, CONTENT_FALLBACK } from '@/lib/circles/index-data'

// The Circles index is now a TEMPLATE + BLOCKS surface (PAGE-FRAMEWORK): the IndexTemplate
// shell carries the operator-editable header (title / description / CTA + the Start-a-circle
// action), and the BODY is the standardized Circles block layout rendered through Puck. The
// route fetches the live index data once (getCirclesIndexData) and injects it into the blocks
// via `metadata.circlesIndex` (the LiveStats pattern), so each block renders a slice of the
// same faceted, sorted read. Block order/content come from an operator-published doc when one
// exists, else the coded default template — so operators rearrange and edit it in the page
// editor (/edit/circles) exactly like the marketing pages.

const EMPTY: Data = { content: [], root: {} }

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
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

  return (
    <IndexTemplate
      // Standardized header (PAGE-FRAMEWORK): breadcrumb -> cropped hero -> title, from the
      // template's first-class props.
      trail={[
        { href: '/network', label: 'Community' },
        { href: '/circles', label: 'Circles' },
      ]}
      // The uniform overlay Hero Header (the Journeys/Practices/Library grammar): operator image
      // wins, else a calm section default so the hero band always renders.
      heroImage={content.heroImage ?? '/images/site/group-of-friends.jpg'}
      heroOverlay
      title={content.title}
      action={
        signedIn || (content.ctaLabel && content.ctaHref) ? (
          <div className="flex items-center gap-2">
            {signedIn && (
              <NewCircleCompose
                interests={interests}
                buttonLabel="Start a circle"
                canCreate={canCreate}
                buttonClass="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              />
            )}
            {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
            {content.ctaLabel && content.ctaHref && (
              <a
                href={content.ctaHref}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              >
                {content.ctaLabel}
              </a>
            )}
          </div>
        ) : undefined
      }
      description={
        <>
          {/* Mobile leads with a tight one-liner; desktop keeps the operator-editable pitch. */}
          <span className="sm:hidden">Find a circle near you, or start your own.</span>
          <span className="hidden sm:inline">{content.description}</span>
        </>
      }
    >
      {/* The body: the standardized, rearrangeable Circles blocks, fed the live data. */}
      <BlockRender config={config} data={data} metadata={{ circlesIndex }} />
    </IndexTemplate>
  )
}
