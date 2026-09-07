import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { DetailTemplate } from '@/components/templates/detail-template'
import { loadTierChrome } from '@/lib/hierarchy/tier-detail'
import {
  TierDetailBody,
  TierDetailFrame,
  metaLine,
  tierDetailHeader,
  type TierDetailView,
} from '@/components/hierarchy/tier-detail'
import { getNexusCapabilities } from '@/lib/core/load-capabilities'
import { updateNexusField } from '../admin-actions'

// The Nexus tier of the hierarchy detail page. Everything it shares with `/hubs/[slug]` — the
// frame, the header lockup, the scoped Insight band, the child list and its row — lives in
// `components/hierarchy/tier-detail.tsx`, and the one round-trip behind it in
// `lib/hierarchy/tier-detail.ts` (HYG-046). This file owns only what is Nexus-specific: its
// entity query and the view it builds. Add nothing here that a Hub would also want.

type NexusDetail = {
  id: string
  name: string
  slug: string
  status: string
  member_cap: number
  mentor: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  outpost: { id: string; name: string; region: { name: string } | null } | null
}

type HubRow = {
  id: string
  name: string
  slug: string
  status: string
  guide: { display_name: string; handle: string } | null
  circles: { member_count: number | null }[]
}

export default async function NexusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: rawNexus } = await admin
    .from('nexuses')
    .select(
      `id, name, slug, status, member_cap,
       mentor:profiles!mentor_id ( id, display_name, handle, avatar_url ),
       outpost:outposts!outpost_id (
         id, name,
         region:nexus_regions!region_id ( name )
       )`
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!rawNexus) notFound()
  const nexus = rawNexus as unknown as NexusDetail

  const { caps, canManage, showsInsight, hero, children: hubs } = await loadTierChrome<HubRow>({
    kind: 'nexus',
    id: nexus.id,
    path: `/nexuses/${slug}`,
    loadCapabilities: getNexusCapabilities,
    children: admin
      .from('hubs')
      .select(
        `id, name, slug, status,
         guide:profiles!guide_id ( display_name, handle ),
         circles ( member_count )`
      )
      .eq('nexus_id', nexus.id)
      .order('name', { ascending: true }),
  })

  const membersIn = (hub: HubRow) => hub.circles.reduce((s, c) => s + (c.member_count ?? 0), 0)
  const totalMembers = hubs.reduce((sum, hub) => sum + membersIn(hub), 0)

  const view: TierDetailView = {
    kind: 'nexus',
    id: nexus.id,
    name: nexus.name,
    slug: nexus.slug,
    status: nexus.status,
    href: `/nexuses/${nexus.slug}`,
    caps: Array.from(caps),
    canManage,
    saveName: canManage ? updateNexusField.bind(null, nexus.id, slug, 'name') : null,
    crumbs: [
      nexus.outpost?.region?.name ? { label: nexus.outpost.region.name } : null,
      nexus.outpost ? { label: nexus.outpost.name } : null,
      { label: nexus.name },
    ].filter(Boolean) as { label: string; href?: string }[],
    lead: nexus.mentor
      ? { role: 'Mentor', name: nexus.mentor.display_name, handle: nexus.mentor.handle }
      : null,
    summary: `${totalMembers} / ${nexus.member_cap} members · ${hubs.length} hubs`,
    capacity: {
      value: totalMembers,
      max: nexus.member_cap,
      label: `${totalMembers} of ${nexus.member_cap} members`,
    },
    showsInsight,
    totalMembers,
    childLabel: 'Hubs',
    childNoun: 'hub',
    rows: hubs.map((hub) => ({
      id: hub.id,
      name: hub.name,
      href: `/hubs/${hub.slug}`,
      status: hub.status,
      meta: metaLine(
        hub.guide ? `Guide: ${hub.guide.display_name}` : null,
        `${hub.circles.length} circles · ${membersIn(hub)} members`
      ),
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
