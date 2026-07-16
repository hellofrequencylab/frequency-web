// CRM › Marketing — send email to the whole community or a section (all members, a saved segment, a
// circle, or individuals), with campaigns + funnels + drafts + sent in one place. Reuses the messaging
// console (one source of truth) and the gated email-studio send pipeline; the "New email" popup always
// saves as a draft. Gate mirrors the messaging surface (admin floor OR the marketing capability).

import { Send, Megaphone, Activity, Rocket, FileEdit, Clock } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { requireAdmin } from '@/lib/admin/guard'
import { getMessagingConsole } from '@/lib/messaging/console'
import { listSegmentOptions } from '@/lib/studio/campaigns'
import { MarketingWorkspace } from '@/components/admin/crm/marketing-workspace'

export const dynamic = 'force-dynamic'

export default async function CrmMarketingPage({
  searchParams,
}: {
  // `open=<campaignId>` opens that draft straight into the composer (the guided generator routes here after
  // Vera drafts a single campaign, so the operator lands on their new draft ready to review). Heavily-modified
  // Next.js: searchParams is a Promise.
  searchParams: Promise<{ open?: string }>
}) {
  await requireAdmin('admin', { staff: 'marketing' })
  const { open } = await searchParams
  const [{ campaigns, funnels, counts }, segments] = await Promise.all([
    getMessagingConsole(),
    listSegmentOptions(),
  ])

  return (
    <AdminTemplate
      eyebrow="Resonance CRM"
      title="Marketing"
      icon={Send}
      width="wide"
      description="Send email to the whole community or a section: all members, a saved segment, a circle, or individuals. Campaigns and funnels live here, and the composer always saves as a draft until you send."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Campaigns" value={counts.campaigns} icon={Megaphone} />
        <StatCard label="Funnels" value={counts.funnels} icon={Activity} />
        <StatCard label="Live" value={counts.live} icon={Rocket} />
        <StatCard label="Scheduled" value={counts.scheduled} icon={Clock} />
        <StatCard label="Drafts" value={counts.drafts} icon={FileEdit} />
      </div>

      <AdminSection
        title="Everything you send"
        description="Campaigns and funnels in one place, colored by status. Search, or start a new email."
      >
        <MarketingWorkspace campaigns={campaigns} funnels={funnels} segments={segments} openCampaignId={open} />
      </AdminSection>
    </AdminTemplate>
  )
}
