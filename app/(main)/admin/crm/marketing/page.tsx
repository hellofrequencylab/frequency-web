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
import { getMarketingEmailOverview } from '@/lib/email-studio/analytics'
import { MarketingWorkspace } from '@/components/admin/crm/marketing-workspace'
import { EmailPerformance } from '@/components/admin/crm/email-performance'
import { EmailBestPractices } from '@/components/admin/crm/email-best-practices'

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
  const [{ campaigns, funnels, counts }, segments, emailOverview] = await Promise.all([
    getMessagingConsole(),
    listSegmentOptions(),
    getMarketingEmailOverview(),
  ])

  return (
    <AdminTemplate
      eyebrow="Resonance CRM"
      title="Marketing"
      icon={Send}
      width="wide"
      description="Send email to the whole community or a section: all members, a saved segment, a circle, or individuals. Campaigns and funnels live here, and the composer always saves as a draft until you send."
    >
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        <StatCard size="xs" label="Campaigns" value={counts.campaigns} icon={Megaphone} />
        <StatCard size="xs" label="Funnels" value={counts.funnels} icon={Activity} />
        <StatCard size="xs" label="Live" value={counts.live} icon={Rocket} />
        <StatCard size="xs" label="Scheduled" value={counts.scheduled} icon={Clock} />
        <StatCard size="xs" label="Drafts" value={counts.drafts} icon={FileEdit} />
      </div>

      <AdminSection
        title="Email performance"
        description="How everything you send is landing: delivered, opened, clicked, bounced, and flagged. Clicks are the signal to trust (Apple Mail privacy inflates opens)."
      >
        <EmailPerformance overview={emailOverview} />
      </AdminSection>

      <AdminSection
        title="Best practices"
        description="Live health checks on your deliverability, plus the levers that move open rate."
      >
        <EmailBestPractices overview={emailOverview} />
      </AdminSection>

      <AdminSection
        title="Everything you send"
        description="Campaigns and funnels in one place, colored by status. Click a sent email to fold open its stats and Vera's read on your opens."
      >
        <MarketingWorkspace campaigns={campaigns} funnels={funnels} segments={segments} openCampaignId={open} />
      </AdminSection>
    </AdminTemplate>
  )
}
