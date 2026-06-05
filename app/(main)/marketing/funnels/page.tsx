// Admin funnels — campaign builder (ADR-126, Phase 2). Lives in the /marketing
// workspace (the layout already gates admin/staff). Group entry points into
// campaigns, generate flyers + QR, and track scans.

import { DashboardTemplate } from '@/components/templates/dashboard-template'
import { StatCard } from '@/components/ui/stat-card'
import { Megaphone, QrCode } from 'lucide-react'
import { listCampaigns } from '@/lib/entry-points/campaigns'
import { listTemplateGovernance } from '@/lib/entry-points/template-settings'
import { FunnelsManager } from './funnels-client'
import { TemplateGovernance } from './template-governance'

export const dynamic = 'force-dynamic'

export default async function FunnelsPage() {
  const [campaigns, templateGov] = await Promise.all([listCampaigns(), listTemplateGovernance()])
  const totalEntries = campaigns.reduce((s, c) => s + c.entryCount, 0)
  const totalScans = campaigns.reduce((s, c) => s + c.scans, 0)

  return (
    <DashboardTemplate
      eyebrow="Funnels"
      title="Campaigns"
      description="Group entry points into campaigns, generate branded flyers + QR, and track scans. Entry points point at persona lead flows, circles/events, or pages."
      stats={
        <>
          <StatCard label="Campaigns" value={campaigns.length} icon={Megaphone} />
          <StatCard label="Entry points" value={totalEntries} icon={QrCode} />
          <StatCard label="Total scans" value={totalScans} icon={QrCode} />
        </>
      }
    >
      <FunnelsManager campaigns={campaigns} />
      <div className="mt-6">
        <TemplateGovernance
          templates={templateGov.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji, blurb: t.blurb, enabled: t.enabled }))}
        />
      </div>
    </DashboardTemplate>
  )
}
