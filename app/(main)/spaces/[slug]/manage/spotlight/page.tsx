import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { loadSpaceAuthoredContent } from '@/lib/spaces/page-doc'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { readTagline } from '@/lib/spaces/tagline'
import { readSpaceSpotlight, spaceSpotlightGrid } from '@/lib/spaces/spotlight'
import { resolveRows } from '@/lib/entity-blocks/layout'
import type { BuilderRailData } from '@/components/entity-blocks/profile-page-builder'
import { FocusTemplate } from '@/components/templates'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { renderSpaceBlockNodes } from '@/components/widgets/space-profile/space-profile-modules'
import { LiveProfileGrid } from '@/components/entity-blocks/live-profile-grid'
import { SpotlightAccent, SpotlightHeader } from '@/components/spotlight/space-spotlight'
import { SpaceSpotlightEditor } from '@/components/spotlight/space-spotlight-editor'
import { getSpaceLayoutRailData } from '../rail-getters'
import { spaceCanTakePayments } from '@/lib/pricing/payments-gate'
import { loadUpgradeOffer } from '@/lib/pricing/business-offer'
import type { UpgradeMomentSetup } from '@/components/pricing/upgrade-moment'
import { siteSubdomainHost } from '@/lib/sites/host'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import { DEFAULT_WWW_CNAME } from '@/lib/sites/vercel-domains'
import { readSpotlightClicks } from '@/lib/spaces/spotlight-clicks'
import { blockDataList } from '@/lib/entity-blocks/block-data-sources'

// THE SPACE SPOTLIGHT EDITOR PAGE (LIVE-851), in the Space console. Gated like every console page: the
// Space must be visible and the caller a manager (a staff previewer sees it read-only, and every write
// re-gates in its action). Seeds the shared builder with the Spotlight's own one-column layout
// (preferences.spotlight, lib/spaces/spotlight.ts) plus the Space page builder's locked blocks and picker
// data, and builds the live preview from the SAME block nodes the public Spotlight renders.

export const metadata: Metadata = {
  title: 'Spotlight',
  description: 'Build the link page you share: your bookings, offers, Journeys, events and links on one page.',
  robots: { index: false, follow: false },
}

export default async function SpaceSpotlightEditorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage && !staffViewing) notFound()

  const spotlight = readSpaceSpotlight(space.preferences)
  const grid = spaceSpotlightGrid(spotlight)
  const rows = resolveRows(grid, 'space')
  const context = toProfileContext(space)

  const [data, authored, tagline, pageRail, canSell, domain, counts, cards] = await Promise.all([
    getSpaceContentData(context.id, {
      name: context.brandName,
      type: context.type,
      logoUrl: context.logoUrl,
      coverUrl: context.coverUrl,
      tagline: context.tagline,
      primaryCta: { label: defaultPrimaryCtaLabel(context.type), href: `/spaces/${context.slug}/book` },
      slug: context.slug,
      profile: context.profile,
    }),
    loadSpaceAuthoredContent(context.preferences, context.brandName),
    readTagline(space.id),
    // The Space page builder's own seed (null for a non-manager): only its locked blocks and picker data are
    // used here, so a Spotlight offers exactly the function-backed blocks the Space page does.
    canManage ? getSpaceLayoutRailData(slug) : Promise.resolve(null),
    spaceCanTakePayments(space.id, { plan: space.plan ?? null }),
    boundSiteDomain(space),
    canManage ? readSpotlightClicks(space.id) : Promise.resolve(new Map<string, number>()),
    canManage ? blockDataList('linkCards', space.id) : Promise.resolve([]),
  ])

  // Link card presses over the last 30 days (LIVE-856), by the card's current label, most pressed first.
  const labels = new Map(cards.map((c) => [c.id, c.label]))
  const clicks = [...counts]
    .filter(([target]) => labels.has(target))
    .sort((a, b) => b[1] - a[1])
    .map(([target, count]) => ({ label: labels.get(target)!, count }))

  // The Spotlight's own addresses (LIVE-855): the paid subdomain link, and spotlight.<domain> on a served domain.
  const subdomain = canSell ? siteSubdomainHost(space.slug) : null
  const ownLinks = { paid: subdomain ? `https://${subdomain}/spotlight` : null, domain, cname: DEFAULT_WWW_CNAME }

  // Selling Link cards need a plan that takes payments (LIVE-854); a free Space sees the upgrade here.
  const upgrade: UpgradeMomentSetup | undefined = canSell
    ? undefined
    : {
        target: { spaceSlug: space.slug, canUpgrade: !!caller?.id && space.ownerProfileId === caller.id },
        offer: await loadUpgradeOffer(),
      }

  const seed: BuilderRailData | null = pageRail
    ? {
        matchId: space.slug,
        rows,
        hidden: [],
        content: grid.content ?? {},
        style: grid.style ?? {},
        customized: spotlight.layout != null,
        lockedIds: pageRail.lockedIds,
        pickerData: pageRail.pickerData,
      }
    : null

  const preview = (
    <SpotlightAccent space={space}>
      <div className="mx-auto max-w-xl rounded-card border border-border bg-canvas px-4 pb-10">
        <SpotlightHeader space={space} tagline={tagline} />
        <div className="@container/profile mt-8">
          <LiveProfileGrid
            nodes={renderSpaceBlockNodes(context, data, authored, grid)}
            initialRows={rows}
            initialContent={grid.content ?? {}}
            initialStyle={grid.style ?? {}}
          />
        </div>
      </div>
    </SpotlightAccent>
  )

  const brandName = space.brandName?.trim() || space.name
  return (
    <FocusTemplate
      eyebrow="Manage space"
      title="Spotlight"
      description="One link for your bio or business card. Pick what it shows; bookings, sales and messages still land in your console."
      width="wide"
    >
      {staffViewing && !canManage && (
        <div className="mb-6">
          <StaffPreviewBanner spaceName={brandName} />
        </div>
      )}
      <SpaceSpotlightEditor
        slug={space.slug}
        seed={seed}
        preview={preview}
        initialPublished={spotlight.published}
        readOnly={!canManage}
        upgrade={upgrade}
        ownLinks={ownLinks}
        clicks={canManage ? clicks : undefined}
      />
    </FocusTemplate>
  )
}
