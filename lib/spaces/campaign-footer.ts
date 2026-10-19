// THE FREQUENCY FOOTER on a free Space's campaigns (ADR-1709, LIVE-751). A free Space sends 2 campaigns
// a month, and each carries one quiet line saying it was sent with Frequency; Business and Collective
// send without it. The line itself is the Studio shell's `sentWithFrequency` footer (lib/email-studio/shell.ts,
// EMAIL-024); this module holds the plan rule the composer send and the scheduled send both read.

import { asSpacePlan } from '@/lib/pricing/plans'

/** True when a Space on this plan label sends with the Frequency footer (the free Space). PURE. */
export function campaignCarriesFrequencyFooter(plan: string | null | undefined): boolean {
  return asSpacePlan(plan ?? null) === 'free'
}
