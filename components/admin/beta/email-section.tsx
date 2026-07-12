import { AdminSection } from '@/components/templates'
import { seedBetaLaunchEmails } from '@/lib/beta/email-templates'
import { listSegmentOptions } from '@/lib/studio/campaigns'
import { getEmailStats } from '@/lib/studio/analytics'
import { listBetaSequenceEmails } from '@/app/(main)/admin/email-studio/actions'
import { BetaCampaignWorkspace } from './email/beta-campaign-workspace'

// BETA COMMAND CENTER — the CAMPAIGN tab. This tab is JUST the beta broadcast campaign: the numbered launch
// email sequence on the left, campaign stats on the right, and one full-width block editor below. No generic
// template gallery, no starter loader, no leftover Campaigns / Funnels / Vera clutter — those live elsewhere
// in the codebase and are intentionally kept OFF this surface (the owner's directive: this page is the beta
// campaign, nothing else).
//
// The six broadcast launch emails auto-seed into `campaigns` on first view (seedBetaLaunchEmails, idempotent +
// writer-gated). listBetaSequenceEmails then reads them back in send order (the P0 transactional confirm is
// excluded). Server Component: seeds fail-soft, self-fetches in parallel, and hands serializable data to the
// client workspace island. Reads gate at the /admin/beta layout; every mutation re-gates in its action.
export async function BetaEmailSection() {
  // Populate the sequence with the beta launch emails. Idempotent and writer-gated; fail-soft so a seed
  // hiccup never blocks the page (the tab still renders whatever is already in the campaigns table).
  try {
    await seedBetaLaunchEmails()
  } catch {
    // Ignore: render whatever is already seeded.
  }

  const [sequence, segments, stats] = await Promise.all([
    listBetaSequenceEmails(),
    listSegmentOptions(),
    getEmailStats(30),
  ])

  const delivered = stats.byType.delivered ?? stats.byType.sent ?? 0
  const opens = stats.byType.opened ?? stats.byType.open ?? 0
  const clicks = stats.byType.clicked ?? stats.byType.click ?? 0

  return (
    <AdminSection
      title="Beta campaign"
      description="The beta launch sequence, in send order. Pick an email to edit it block by block, set each one's target send date, and watch the campaign's delivery at a glance. Nothing sends until it is approved."
    >
      <BetaCampaignWorkspace
        initialSequence={sequence}
        segments={segments}
        stats={{
          delivered,
          opens,
          clicks,
          deliveryRate: stats.deliveryRate,
          suppressed: stats.suppressed,
        }}
      />
    </AdminSection>
  )
}
