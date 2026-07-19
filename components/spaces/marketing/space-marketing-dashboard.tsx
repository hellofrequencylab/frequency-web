import { AdminSection } from '@/components/templates'
import { EmailPerformance } from '@/components/admin/crm/email-performance'
import { EmailBestPractices } from '@/components/admin/crm/email-best-practices'
import { EmailEnableCard } from '@/components/spaces/email/email-enable-card'
import { SpaceMarketingWorkspace } from './space-marketing-workspace'
import type { MessagingCampaignItem } from '@/lib/messaging/console'
import type { MarketingEmailOverview } from '@/lib/email-studio/analytics'
import type { EmailColors } from '@/lib/email-studio/render'

// SPACE MARKETING DASHBOARD — the "Email" panel of the space Marketing tab. The SAME body as the admin CRM
// Marketing page, exactly: three AdminSection blocks — "Email performance" (EmailPerformance), "Everything you
// send" (the search + New email + MessagingConsole table, via SpaceMarketingWorkspace), and "Best practices"
// (EmailBestPractices) — reusing the admin components unchanged, fed this Space's own deliverability overview
// and campaigns. The tab header (PageHeading "Marketing" + the pipeline quick stats) is rendered one level up
// in SpaceMarketing, mirroring the admin page's header. The email kill-switch enable card leads when off.
//
// A Server Component: it only composes. The one interactive piece (search / New email / delete + the compose
// popup) lives in the client SpaceMarketingWorkspace. Voice canon: no em dashes.

export function SpaceMarketingDashboard({
  spaceId,
  slug,
  colors,
  tags,
  segments,
  campaigns,
  overview,
  emailEnabled,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  colors: EmailColors
  tags: string[]
  segments: { id: string; name: string }[]
  campaigns: MessagingCampaignItem[]
  overview: MarketingEmailOverview
  /** The per-Space email kill-switch. When off, the enable card leads (nothing can send until it is on). */
  emailEnabled: boolean
  readOnly?: boolean
}) {
  return (
    <div className="space-y-8 lg:space-y-10">
      {!emailEnabled && !readOnly && <EmailEnableCard spaceId={spaceId} slug={slug} />}

      <AdminSection
        title="Email performance"
        description="How everything you send is landing: delivered, bounced, and flagged, over your own contacts. Clicks are the signal to trust (Apple Mail privacy inflates opens)."
      >
        <EmailPerformance overview={overview} />
      </AdminSection>

      <AdminSection
        title="Everything you send"
        description="Your emails in one place, colored by status. Click one to open it, or start a new one."
      >
        <SpaceMarketingWorkspace
          spaceId={spaceId}
          slug={slug}
          colors={colors}
          tags={tags}
          segments={segments}
          campaigns={campaigns}
          readOnly={readOnly}
        />
      </AdminSection>

      <AdminSection
        title="Best practices"
        description="Live health checks on your deliverability, plus the levers that move open rate."
      >
        <EmailBestPractices overview={overview} />
      </AdminSection>
    </div>
  )
}
