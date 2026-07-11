import { Mail, MousePointerClick, Eye, Send } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { AdminSection } from '@/components/templates'
import { listBetaCampaigns, listBetaFunnels } from '@/lib/beta/email'
import { betaTemplateLabels } from '@/lib/beta/email-templates'
import { listPhases } from '@/lib/beta/phases'
import { listSegmentOptions } from '@/lib/studio/campaigns'
import { getEmailStats } from '@/lib/studio/analytics'
import { CampaignsPanel, type CampaignCardData, type PhaseOption, type SegmentOption } from './email/campaigns-panel'
import { FunnelsPanel } from './email/funnels-panel'
import { TemplatesPanel } from './email/templates-panel'
import { VeraEditor } from './email/vera-editor'

// WAVE 2: EMAIL — the section that actually SENDS, so it is the strictest consumer of
// the approval spine. Four blocks, all inside the email tab:
//   1. Campaigns with the Draft → Ready → Approved → Sent gate (the send path calls
//      assertApproved FIRST; see lib/beta/email.ts sendApprovedBetaCampaign).
//   2. Funnels + triggers — arm-once-then-pausable drips + event automations.
//   3. Pre-loaded best-practice templates WITH content, loaded as DRAFTS.
//   4. Vera copy editor — drafts/refines through withVoice, linted, never auto-sent.
//
// Server Component: self-fetches in parallel, hands serializable data to the client
// islands. Reads gate at the /admin/beta layout; every mutation re-gates in its action.
// Mounted by the page switch only when tab === 'email', so a plain async component
// (matching the sibling sections) keeps the rest of the workspace off its await.
export async function BetaEmailSection() {
  const [campaigns, funnels, phases, segments, stats] = await Promise.all([
    listBetaCampaigns(),
    listBetaFunnels(),
    listPhases(),
    listSegmentOptions(),
    getEmailStats(30),
  ])

  const phaseTitle = new Map(phases.map((p) => [p.id, `${p.key} · ${p.title}`]))
  const phaseOptions: PhaseOption[] = phases.map((p) => ({ id: p.id, label: `${p.key} · ${p.title}` }))
  const segmentOptions: SegmentOption[] = segments.map((s) => ({ key: s.key, label: s.label }))

  const cards: CampaignCardData[] = campaigns.map((c) => ({
    id: c.id,
    subject: c.subject,
    body: c.body,
    segment: c.segment,
    approvalStatus: c.approvalStatus,
    phaseTitle: c.phaseId ? phaseTitle.get(c.phaseId) ?? 'Unfiled' : 'Unfiled',
    recipientCount: c.recipientCount,
    testSentAt: c.testSentAt,
    scheduledFor: c.scheduledFor,
    sentAt: c.sentAt,
    // Per-campaign open/click attribution is not tracked; the program-wide activity
    // row below carries opens/clicks. The card confirms the recipient count.
    stats: null,
  }))

  const sent = stats.byType.delivered ?? stats.byType.sent ?? 0
  const opens = stats.byType.opened ?? stats.byType.open ?? 0
  const clicks = stats.byType.clicked ?? stats.byType.click ?? 0

  const templatesLoaded = campaigns.length > 0 || funnels.length > 0

  return (
    <div className="space-y-8">
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
        title="Campaigns"
        description="Draft, preview, test-send to yourself, mark ready, then approve. Nothing sends until it is approved."
      >
        <CampaignsPanel campaigns={cards} phases={phaseOptions} segments={segmentOptions} />
      </AdminSection>

      <AdminSection
        title="Funnels + triggers"
        description="Timed drips and event triggers for the Beta. Each stays off until an approver arms it, and a pause switch turns it back off."
      >
        <FunnelsPanel funnels={funnels} />
      </AdminSection>

      <AdminSection
        title="Starter templates"
        description="Pre-written copy for the whole Beta arc. Load it as drafts, then review and edit before approving."
      >
        <TemplatesPanel labels={betaTemplateLabels()} loaded={templatesLoaded} />
      </AdminSection>

      <AdminSection
        title="Write with Vera"
        description="Draft or refine beta copy in the voice. Vera never sends, and the voice check flags em dashes before anything can go ready."
      >
        <VeraEditor />
      </AdminSection>
    </div>
  )
}
