import { Mail, MousePointerClick, Eye, Send } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { AdminSection } from '@/components/templates'
import { listBetaFunnels } from '@/lib/beta/email'
import { seedBetaLaunchEmails } from '@/lib/beta/email-templates'
import { listSegmentOptions } from '@/lib/studio/campaigns'
import { getEmailStats } from '@/lib/studio/analytics'
import { listEmailCampaigns } from '@/app/(main)/admin/email-studio/actions'
import { listEmailTemplates } from '@/lib/email-studio/templates'
import { EmailStudioMount } from '@/components/admin/email-studio/email-studio-mount'
import { FunnelsPanel } from './email/funnels-panel'
import { VeraEditor } from './email/vera-editor'

// WAVE 2: EMAIL — one clean Email Studio surface, top to bottom:
//   1. Email Studio — the two-pane editor: the beta launch emails as compact cards on
//      the LEFT, the themed block editor on the RIGHT. This is the primary surface, and
//      the send path still calls assertApproved FIRST (lib/beta/email.ts).
//   2. Email activity — the program-wide stat row (opens/clicks from the webhook).
//   3. Funnels + triggers — arm-once-then-pausable drips + event automations, folded
//      below the Studio as the automation helper.
//   4. Write with Vera — the AI copy editor, folded below the Studio as the compose
//      helper. Vera drafts/refines through withVoice, is linted, and never auto-sends.
//
// The seven themed beta launch emails auto-seed into the Studio left rail on first view
// (seedBetaLaunchEmails, idempotent + writer-gated), so there is no manual template
// loader and no separate campaigns list to contradict the Studio.
//
// Server Component: seeds fail-soft, then self-fetches in parallel and hands serializable
// data to the client islands. Reads gate at the /admin/beta layout; every mutation
// re-gates in its action. Mounted by the page switch only when tab === 'email'.
export async function BetaEmailSection() {
  // Populate the Studio left rail with the beta launch emails. Idempotent and
  // writer-gated; fail-soft so a seed hiccup never blocks the page.
  try {
    await seedBetaLaunchEmails()
  } catch {
    // Ignore: the Studio still renders whatever is already in the campaigns table.
  }

  const [funnels, segments, stats, emailStudioCampaigns, emailTemplates] = await Promise.all([
    listBetaFunnels(),
    listSegmentOptions(),
    getEmailStats(30),
    listEmailCampaigns(),
    listEmailTemplates(),
  ])

  const sent = stats.byType.delivered ?? stats.byType.sent ?? 0
  const opens = stats.byType.opened ?? stats.byType.open ?? 0
  const clicks = stats.byType.clicked ?? stats.byType.click ?? 0

  return (
    <div className="space-y-8">
      <AdminSection
        title="Email Studio"
        description="The beta launch emails are loaded and ready to edit. Pick one on the left, arrange it block by block on the right, preview the inbox, and send yourself a test. Nothing sends until it is approved."
      >
        <EmailStudioMount
          initialCampaigns={emailStudioCampaigns}
          templates={emailTemplates}
          segments={segments}
        />
      </AdminSection>

      <AdminSection
        title="Email activity"
        description="Beta email at a glance, last 30 days. Opens and clicks come from the delivery webhook."
      >
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <StatCard label="Delivered" value={sent.toLocaleString()} icon={Send} />
          <StatCard label="Opens" value={opens.toLocaleString()} icon={Eye} />
          <StatCard label="Clicks" value={clicks.toLocaleString()} icon={MousePointerClick} />
          <StatCard
            label="Delivery rate"
            value={`${Math.round(stats.deliveryRate * 100)}%`}
            icon={Mail}
            detail={`${stats.suppressed.toLocaleString()} suppressed`}
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Funnels + triggers"
        description="Timed drips and event triggers for the Beta, beneath the Studio. Each stays off until an approver arms it, and a pause switch turns it back off."
      >
        <FunnelsPanel funnels={funnels} />
      </AdminSection>

      <AdminSection
        title="Write with Vera"
        description="Draft or refine beta copy in the voice, then take it into the Studio. Vera never sends, and the voice check flags em dashes before anything can go ready."
      >
        <VeraEditor />
      </AdminSection>
    </div>
  )
}
