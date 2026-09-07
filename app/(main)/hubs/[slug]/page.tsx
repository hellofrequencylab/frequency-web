import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { DetailTemplate } from '@/components/templates/detail-template'
import { loadTierChrome } from '@/lib/hierarchy/tier-detail'
import { TierDetailBody, TierDetailFrame, metaLine, tierCrumbs, tierDetailHeader } from '@/components/hierarchy/tier-detail'
import type { TierDetailView } from '@/components/hierarchy/tier-detail'
import { getHubCapabilities } from '@/lib/core/load-capabilities'
import { updateHubField } from '../admin-actions'
import type { CircleBase } from '@/lib/types/circle'

// The Hub tier of the hierarchy detail page. Everything it shares with `/nexuses/[slug]` — the
// frame, the header lockup, the scoped Insight band, the child list and its row — lives in
// `components/hierarchy/tier-detail.tsx`, and the one round-trip behind it in
// `lib/hierarchy/tier-detail.ts` (HYG-046). This file owns only what is Hub-specific: its entity
// query and the view it builds. Add nothing here that a Nexus would also want.

/** A Hub can hold five Circles. Shown as the denominator in the summary line. */
const CIRCLE_CAP = 5

type HubDetail = {
  id: string
  name: string
  slug: string
  status: string
  guide: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  nexus: {
    id: string
    name: string
    slug: string
    outpost: { id: string; name: string; region: { name: string } | null } | null
  } | null
}

type CircleRow = CircleBase & {
  slug: string
  type: 'in-person' | 'online'
  host: { display_name: string; handle: string } | null
}

export default async function HubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: rawHub } = await admin
    .from('hubs')
    .select(
      `id, name, slug, status,
       guide:profiles!guide_id ( id, display_name, handle, avatar_url ),
       nexus:nexuses!nexus_id (
         id, name, slug,
         outpost:outposts!outpost_id (
           id, name,
           region:nexus_regions!region_id ( name )
         )
       )`
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!rawHub) notFound()
  const hub = rawHub as unknown as HubDetail

  const { caps, canManage, showsInsight, hero, children: circles } = await loadTierChrome<CircleRow>({
    kind: 'hub',
    id: hub.id,
    path: `/hubs/${slug}`,
    loadCapabilities: getHubCapabilities,
    children: admin
      .from('circles')
      .select(
        `id, name, slug, type, member_count, member_cap, status,
         host:profiles!host_id ( display_name, handle )`
      )
      .eq('hub_id', hub.id)
      .order('name', { ascending: true }),
  })

  const totalMembers = circles.reduce((sum, c) => sum + c.member_count, 0)

  const view: TierDetailView = {
    kind: 'hub',
    id: hub.id,
    name: hub.name,
    slug: hub.slug,
    status: hub.status,
    href: `/hubs/${hub.slug}`,
    caps: Array.from(caps),
    canManage,
    saveName: canManage ? updateHubField.bind(null, hub.id, slug, 'name') : null,
    crumbs: tierCrumbs(
      hub.nexus?.outpost?.region?.name,
      hub.nexus?.outpost?.name,
      hub.nexus && { label: hub.nexus.name, href: `/nexuses/${hub.nexus.slug}` },
      hub.name
    ),
    lead: hub.guide
      ? { role: 'Guide', name: hub.guide.display_name, handle: hub.guide.handle }
      : null,
    summary: `${totalMembers} members across ${circles.length} / ${CIRCLE_CAP} circles`,
    showsInsight,
    totalMembers,
    childLabel: 'Circles',
    childNoun: 'circle',
    rows: circles.map((circle) => ({
      id: circle.id,
      name: circle.name,
      href: `/circles/${circle.slug}`,
      status: circle.status,
      chip: circle.type,
      meta: metaLine(circle.host ? `Host: ${circle.host.display_name}` : null),
      capacity: { count: circle.member_count, cap: circle.member_cap },
    })),
  }

  return (
    <TierDetailFrame crumbs={view.crumbs}>
      <DetailTemplate {...hero} {...tierDetailHeader(view)}>
        <TierDetailBody view={view} />
      </DetailTemplate>
    </TierDetailFrame>
  )
}
