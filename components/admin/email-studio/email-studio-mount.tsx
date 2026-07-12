'use client'

import { EmailStudioWorkspace } from './workspace'
import { TemplateGallery } from './template-gallery'
import { SendPanel, type CampaignStatus, type SegmentOption } from './send-panel'
import { AnalyticsInline } from './analytics-inline'
import type { EmailCampaignCard } from '@/app/(main)/admin/email-studio/actions'
import type { EmailTemplate } from '@/lib/email-studio/types'

// The CLIENT composition point that wires the standalone phase panels into the workspace slots. It lives
// here (not in the server email-section) because the slots are functions rendered inside the client
// workspace with the client-selected campaign: the template gallery (Phase 3), the send / schedule panel
// (Phase 4), and the per-campaign analytics (Phase 6). Each panel stays standalone; this file is the only
// place they meet.
export function EmailStudioMount({
  initialCampaigns,
  templates,
  segments,
}: {
  initialCampaigns: EmailCampaignCard[]
  templates: EmailTemplate[]
  segments: SegmentOption[]
}) {
  return (
    <EmailStudioWorkspace
      initialCampaigns={initialCampaigns}
      templateGallery={(onUse) => <TemplateGallery templates={templates} onUse={onUse} />}
      sendPanel={(id, status) => (
        <SendPanel campaignId={id} status={status as CampaignStatus} segments={segments} />
      )}
      analyticsPanel={(id) => <AnalyticsInline campaignId={id} />}
    />
  )
}
