import { Radio, Users, Circle as CircleIcon } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NewChannelCompose } from './new-channel-compose'
import { MarketHero } from '@/components/marketplace/market-hero'
import { HERO_PRIMARY_BTN, HERO_SECONDARY_BTN } from '@/components/marketplace/hero-buttons'
import { MarketplaceStats } from '@/components/marketplace/marketplace-bar'
import { PageAdminBar } from '@/components/layout/page-admin-bar'
import { PageModules } from '@/components/widgets/page-modules'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { resolveMarketHero } from '@/lib/layout/index-hero'

// Channels (ADR-270/294). The page now opens on the SHARED MarketHero header (the same hero band
// Events / Classifieds / Business Spaces / Circles use) so every browse surface reads as one
// header: a centered, keyword-forward H1 from the operator-editable content (ADR-180), the
// description, and the action row (Create Channel + the operator CTA). No in-hero search here:
// the pillar-grouped body is one self-fetching layout module with no search facet, and a dead
// search box is worse than none. The stats band under the hero is the shared soft-chip row
// (MarketplaceStats) with this surface's own numbers. The whole pillar-grouped browse below stays
// module-driven: the toc, the four Pillars with their Channels (split tuned-in vs explore), and
// the Pillars jump-nav are one layout module (channels-list) the operator can arrange
// (Settings > Page > Layout). Semantic DAWN tokens only, no hex, no em dashes.

// Coded defaults for the operator-editable content (ADR-180) — shared by the
// page header and the SEO metadata below.
const CONTENT_FALLBACK = {
  title: 'Channels',
  description:
    'The four Pillars (Mind, Body, Spirit, and Expression) are how Frequency is organized. Channels live inside them: global topics anyone can tune into, each carrying a practice that Circles run locally. Pick a Pillar, find your Channel, then go do it with people near you.',
}

// Coded hero fallback when the operator has not set a hero image.
const HERO_FALLBACK = '/images/site/group-singing.jpg'

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/channels', CONTENT_FALLBACK)
}

export default async function ChannelsPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title: pageTitle, description: pageDescription, heroImage, ctaLabel, ctaHref } =
    await resolvePageContent('/channels', CONTENT_FALLBACK)

  const { data: { user } } = await supabase.auth.getUser()

  let canCreate = false
  if (user) {
    const { data: profile } = await admin
      .from('profiles').select('community_role').eq('auth_user_id', user.id).maybeSingle()
    const role = (profile as { community_role?: string } | null)?.community_role
    canCreate = role === 'host' || role === 'guide' || role === 'mentor' || role === 'admin' || role === 'janitor'
  }

  // The header's independent reads in one batch: the whole hero band through the ONE browse-hero
  // ladder (lib/layout/index-hero, PROG-P4 — operator Settings image, then the page_content hero
  // already resolved above, then the coded cover, plus the operator-tunable header element,
  // ADR-793), the Pillar options for the create dialog, and the stats band's three head-counts
  // (Channels, tuned-in total, Circles practicing one) — all cheap count-only queries.
  const [hero, { data: pillarsData }, { count: channelCount }, { count: tunedInCount }, { count: circleCount }] =
    await Promise.all([
      resolveMarketHero('/channels', { cover: HERO_FALLBACK, contentImage: heroImage }),
      admin
        .from('pillars').select('id, name')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      admin
        .from('topical_channels')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      admin
        .from('topical_channel_memberships')
        .select('id', { count: 'exact', head: true }),
      admin
        .from('circles')
        .select('id', { count: 'exact', head: true })
        .not('topical_channel_id', 'is', null)
        .neq('status', 'archived'),
    ])

  // The create dialog needs the Pillar options (id + name) to sort a new Channel into a Pillar.
  const pillars = (pillarsData ?? []) as { id: string; name: string }[]

  // The action cluster, matching the shared hero button grammar: Create Channel (its own
  // primary-styled trigger) for the roles that may, plus the operator-set CTA (PX.1) as the
  // on-ink secondary — shown only when both label and link are set.
  const actions =
    canCreate || (ctaLabel && ctaHref) ? (
      <>
        {canCreate && <NewChannelCompose pillars={pillars} buttonClass={HERO_PRIMARY_BTN} />}
        {ctaLabel && ctaHref && (
          <a href={ctaHref} className={HERO_SECONDARY_BTN}>
            {ctaLabel}
          </a>
        )}
      </>
    ) : undefined

  return (
    <div className="space-y-6">
      <MarketHero
        {...hero}
        eyebrow="Community"
        title={pageTitle}
        subtitle={pageDescription}
        action={actions}
      />

      {/* This surface's headline stats, in the shared soft-chip band the other browse surfaces use. */}
      <MarketplaceStats
        stats={[
          { label: 'Channels', value: (channelCount ?? 0).toLocaleString(), icon: Radio },
          { label: 'Tuned in', value: (tunedInCount ?? 0).toLocaleString(), icon: Users },
          { label: 'Circles practicing', value: (circleCount ?? 0).toLocaleString(), icon: CircleIcon },
        ]}
      />

      {/* The on-page operator Settings affordance IndexTemplate used to draw — kept under the hero
          as its divider rule so nothing an operator had was lost in the move to MarketHero. */}
      <PageAdminBar asDivider />

      {/* The whole pillar-grouped browse is module-driven and arranged by the operator. The block
          self-fetches (viewer-scoped) and renders the toc, the Pillars, and the jump-nav. */}
      <PageModules route="/channels" />
    </div>
  )
}
