// Campaign detail (ADR-126, Phase 2). Its entry points + an in-place builder that
// reuses the Phase 1 EntryForm/EntryRow, filing new entry points under this campaign.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates/dashboard-template'
import { getCallerProfile } from '@/lib/auth'
import { listMarketingTargets } from '@/lib/qr/marketing'
import { shortLinkUrl } from '@/lib/qr/links'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { getCampaign } from '@/lib/entry-points/campaigns'
import { listEntryPointsByCampaign } from '@/lib/entry-points/store'
import { entryDestinationGroups } from '@/lib/entry-points/destinations'
import type { EntryCard } from '@/app/(main)/entry-points/entry-points-client'
import { CampaignDetail } from './detail-client'

export const dynamic = 'force-dynamic'

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) notFound()

  const me = await getCallerProfile()
  const [targets, eps] = await Promise.all([
    me ? listMarketingTargets(me.id) : Promise.resolve([]),
    listEntryPointsByCampaign(id),
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

  return (
    <DashboardTemplate
      eyebrow={
        <Link href="/marketing/funnels" className="inline-flex items-center gap-1 text-muted hover:text-text">
          <ArrowLeft className="h-3 w-3" /> Campaigns
        </Link>
      }
      title={campaign.name}
      description={`${campaign.entryCount} entry point${campaign.entryCount === 1 ? '' : 's'} · ${campaign.scans} scan${campaign.scans === 1 ? '' : 's'} · ${campaign.status}`}
    >
      <CampaignDetail
        campaign={{ id: campaign.id, name: campaign.name, status: campaign.status }}
        cards={cards}
        destinationGroups={entryDestinationGroups(targets)}
      />
    </DashboardTemplate>
  )
}
