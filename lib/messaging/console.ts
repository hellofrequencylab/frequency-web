// The Messaging console view-model (EMAIL-CAMPAIGNS-FUNNELS-PLAN P1). ONE read that
// gives the unified console its two lists (Campaigns + Funnels) and the KPI counts,
// each normalized onto the shared MessagingStatus vocabulary. Presentation-neutral so
// the console UI and any future surface read the same shapes (PAGE-FRAMEWORK contract).
// Server-only: it composes the existing campaigns + funnels reads, no new tables.

import { listCampaigns } from '@/lib/studio/campaigns'
import { listFunnels } from '@/lib/funnels/store'
import {
  campaignStatusToMessaging,
  funnelStatusToMessaging,
  type MessagingStatus,
} from './status'

export interface MessagingCampaignItem {
  kind: 'campaign'
  id: string
  name: string
  segment: string
  status: MessagingStatus
  recipientCount: number
  sentAt: string | null
  /** Where "Open" goes today: the campaigns composer (the working editor, unchanged). */
  href: string
}

export interface MessagingFunnelItem {
  kind: 'funnel'
  id: string
  name: string
  status: MessagingStatus
  goalEvent: string
  persona: string | null
  stageCount: number
  linkCount: number
  /** The step kinds in order, for the mini flow preview dots. */
  stageKinds: string[]
  /** Where "Open" goes: the new flow view. */
  href: string
}

export interface MessagingConsoleData {
  campaigns: MessagingCampaignItem[]
  funnels: MessagingFunnelItem[]
  counts: {
    campaigns: number
    funnels: number
    live: number
    scheduled: number
    drafts: number
  }
}

// The composer is the working campaign editor; the console links out to it rather than
// re-home it (do not delete the working editors, unify the listing over them).
const CAMPAIGN_COMPOSER_HREF = '/admin/marketing/campaigns'

export async function getMessagingConsole(): Promise<MessagingConsoleData> {
  const [rawCampaigns, funnels] = await Promise.all([listCampaigns(), listFunnels()])

  const campaigns: MessagingCampaignItem[] = rawCampaigns.map((c) => ({
    kind: 'campaign',
    id: c.id,
    name: c.subject,
    segment: c.segment,
    status: campaignStatusToMessaging(c.status),
    recipientCount: c.recipientCount,
    sentAt: c.sentAt,
    href: CAMPAIGN_COMPOSER_HREF,
  }))

  const funnelItems: MessagingFunnelItem[] = funnels.map((f) => ({
    kind: 'funnel',
    id: f.id,
    name: f.name,
    status: funnelStatusToMessaging(f.status),
    goalEvent: f.goalEvent,
    persona: f.persona,
    stageCount: f.stages.length,
    linkCount: f.stages.reduce((n, s) => n + s.links.length, 0),
    stageKinds: f.stages.map((s) => s.kind),
    href: `/admin/marketing/messaging/funnels/${f.id}`,
  }))

  const all: MessagingStatus[] = [...campaigns.map((c) => c.status), ...funnelItems.map((f) => f.status)]
  return {
    campaigns,
    funnels: funnelItems,
    counts: {
      campaigns: campaigns.length,
      funnels: funnelItems.length,
      live: all.filter((s) => s === 'live').length,
      scheduled: all.filter((s) => s === 'scheduled').length,
      drafts: all.filter((s) => s === 'draft').length,
    },
  }
}
