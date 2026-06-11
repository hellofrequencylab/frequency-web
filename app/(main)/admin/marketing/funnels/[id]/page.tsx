// Campaign detail (ADR-126, Phase 2). Its entry points + an in-place builder that
// reuses the Phase 1 EntryForm/EntryRow, filing new entry points under this campaign.

import { notFound } from 'next/navigation'
import { AdminTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { listMarketingTargets } from '@/lib/qr/marketing'
import { shortLinkUrl } from '@/lib/qr/links'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { getCampaign } from '@/lib/entry-points/campaigns'
import { listEntryPointsByCampaignWithOwner, listAssignableMembers } from '@/lib/entry-points/store'
import { entryDestinationGroups } from '@/lib/entry-points/destinations'
import type { EntryCard } from '@/app/(main)/entry-points/entry-points-client'
import { CampaignDetail } from './detail-client'

export const dynamic = 'force-dynamic'

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) notFound()

  const me = await getCallerProfile()
  const [targets, eps, members] = await Promise.all([
    me ? listMarketingTargets(me.id) : Promise.resolve([]),
    listEntryPointsByCampaignWithOwner(id),
    listAssignableMembers(),
  ])

  const cards: EntryCard[] = eps.map((e) => ({
    id: e.id,
    slug: e.slug,
    url: shortLinkUrl(e.slug),
    title: e.title,
    destination: e.destination,
    templateId: e.templateId,
    flyer: e.flyer,
    scans: e.scans,
    qrSvg: renderStyledQrSvg(shortLinkUrl(e.slug), e.style, 200),
  }))
  // codeId → its owner, for the assign-to-crew control.
  const owners: Record<string, { ownerId: string | null; ownerName: string | null }> = {}
  for (const e of eps) owners[e.id] = { ownerId: e.ownerId, ownerName: e.ownerName }

  return (
    <AdminTemplate
      back={{ href: '/admin/marketing/funnels', label: 'Campaigns' }}
      title={campaign.name}
      description={`${campaign.entryCount} entry point${campaign.entryCount === 1 ? '' : 's'} · ${campaign.scans} scan${campaign.scans === 1 ? '' : 's'} · ${campaign.status}`}
    >
      <CampaignDetail
        campaign={{ id: campaign.id, name: campaign.name, status: campaign.status }}
        cards={cards}
        owners={owners}
        members={members}
        destinationGroups={entryDestinationGroups(targets)}
      />
    </AdminTemplate>
  )
}
