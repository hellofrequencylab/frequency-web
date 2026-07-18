// CRM › Marketing — send email to the whole community or a section (all members, a saved segment, a
// circle, or individuals), with campaigns + funnels + drafts + sent in one place. Reuses the messaging
// console (one source of truth) and the gated email-studio send pipeline; the "New email" popup always
// saves as a draft. Gate mirrors the messaging surface (admin floor OR the marketing capability).
//
// Layout (owner directive 2026-07): a top-level workspace, so NO back-link and NO on-page Settings bar.
// The pipeline quick-stats live in a compact card in the header's right slot (~1/3). Body order: Email
// performance (small inline stats) → Everything you send → Best practices + open-rate playbook.

import { Send } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { requireAdmin } from '@/lib/admin/guard'
import { getMessagingConsole } from '@/lib/messaging/console'
import { listSegmentOptions } from '@/lib/studio/campaigns'
import { getMarketingEmailOverview } from '@/lib/email-studio/analytics'
import { MarketingWorkspace } from '@/components/admin/crm/marketing-workspace'
import { MarketingQuickStats } from '@/components/admin/crm/marketing-quick-stats'
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
  // getMarketingEmailOverview is fail-safe (returns an all-zero overview on any error), so it is safe on the
  // critical path — it feeds both the header "Emails sent" stat and the Email performance strip.
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
      hideBackLink
      adminBar={false}
      contentSpacing="tight"
      description="Send email to the whole community or a section: all members, a saved segment, a circle, or individuals. Campaigns and funnels live here, and the composer always saves as a draft until you send."
      actions={<MarketingQuickStats counts={counts} overview={emailOverview} />}
      actionsAlign="center"
    >
      <AdminSection
        title="Email performance"
        description="How everything you send is landing: delivered, opened, clicked, bounced, and flagged. Clicks are the signal to trust (Apple Mail privacy inflates opens)."
      >
        <EmailPerformance overview={emailOverview} />
      </AdminSection>

      <AdminSection
        title="Everything you send"
        description="Campaigns and funnels in one place, colored by status. Click a sent email to fold open its stats and Vera's read on your opens."
      >
        <MarketingWorkspace campaigns={campaigns} funnels={funnels} segments={segments} openCampaignId={open} />
      </AdminSection>

      <AdminSection
        title="Best practices"
        description="Live health checks on your deliverability, plus the levers that move open rate."
      >
        <EmailBestPractices overview={emailOverview} />
      </AdminSection>
    </AdminTemplate>
  )
}
