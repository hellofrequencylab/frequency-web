import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { loadChannelsForum } from '@/lib/channels/forum-index'
import { FqChannelsBody } from '@/components/frequency/members/channels/channels-body'

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


// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/channels', CONTENT_FALLBACK)
}

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const admin = createAdminClient()
  const supabase = await createClient()

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title: pageTitle, body: pageBody, ctaLabel, ctaHref } =
    await resolvePageContent('/channels', CONTENT_FALLBACK)

  const { data: { user } } = await supabase.auth.getUser()

  let canCreate = false
  let myProfileId: string | null = null
  if (user) {
    const { data: profile } = await admin
      .from('profiles').select('id, community_role').eq('auth_user_id', user.id).maybeSingle()
    const role = (profile as { community_role?: string } | null)?.community_role
    myProfileId = (profile as { id?: string } | null)?.id ?? null
    canCreate = role === 'host' || role === 'guide' || role === 'mentor' || role === 'admin' || role === 'janitor'
  }
  const sp = await searchParams
  const params = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>
  return (
    <FqChannelsBody
      index={await loadChannelsForum(admin, myProfileId)}
      params={params}
      content={{ title: pageTitle, body: pageBody ?? null, ctaLabel: ctaLabel ?? null, ctaHref: ctaHref ?? null }}
      signedIn={!!user}
      canCreate={canCreate}
    />
  )
}
