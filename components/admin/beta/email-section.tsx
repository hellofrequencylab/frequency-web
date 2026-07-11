import { EmptyState } from '@/components/ui/empty-state'
import { AdminSection } from '@/components/templates'

// WAVE 2: EMAIL — compose, draft, test, and (after approval) SEND the Beta emails +
// admission waves. This is the section that actually sends, so it is the strictest
// consumer of the approval spine.
//
// CONTRACT (for the Wave-2 email agent):
//   • Export `BetaEmailSection` from THIS file (the page switch imports it by name).
//   • Plugs into page.tsx at `tab === 'email'`.
//   • THE GOVERNING RULE: nothing sends without approval. Before ANY real send call
//       await assertApproved({ type, id })   // from lib/beta/approvals.ts — throws unless approved|scheduled
//     Automation you add here may only ever write DRAFTS (approval_status 'draft').
//   • Reuse the existing send machinery: lib/studio/campaigns.ts (resolveSegment,
//     campaignEmail), app/(main)/admin/marketing/campaigns/actions.ts (sendCampaign),
//     lib/email.ts (enqueueEmail), lib/comms/send-gate.ts (per-recipient consent/
//     suppression). Wrap sendCampaign so it FIRST calls assertApproved, then sends.
//   • Test sends: recordTestSend(ref) (lib/beta/approvals.ts) — a test is not the real
//     send and never clears the gate. Draft/ready transitions: markReady (approvals).
//   • Fold the legacy Beta waitlist triage (app/(main)/admin/marketing/beta) in here so
//     the old leaf can retire.
export function BetaEmailSection() {
  return (
    <AdminSection title="Email">
      <EmptyState
        variant="first-use"
        title="Compose + send lands in Wave 2"
        description="Draft, test, and send the Beta emails and admission waves, each only after approval."
      />
    </AdminSection>
  )
}
