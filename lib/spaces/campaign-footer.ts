// THE FREQUENCY FOOTER on a free Space's campaigns (ADR-1709, LIVE-751). A free Space sends 2 campaigns
// a month, and each carries one quiet line saying it was sent with Frequency; Business and Collective
// send without it. Shared by the composer send (campaigns.ts) and the scheduled send
// (campaigns-send-due.ts) so the two stay byte-identical. Inline styles + hex are correct here: an email
// renders in mail clients, outside the DAWN shell.

import { asSpacePlan } from '@/lib/pricing/plans'
import { SITE_URL } from '@/lib/site'

const FREQUENCY_FOOTER_HTML = `<p style="font-size:12px;color:#999;line-height:1.6;margin:0 0 8px;">Sent with <a href="${SITE_URL}" style="color:#999;">Frequency</a>.</p>`

/** True when a Space on this plan label sends with the Frequency footer (the free Space). PURE. */
export function campaignCarriesFrequencyFooter(plan: string | null | undefined): boolean {
  return asSpacePlan(plan ?? null) === 'free'
}

/** The footer HTML for a plan label, or '' for a paid plan. PURE. */
export function frequencyFooterHtml(plan: string | null | undefined): string {
  return campaignCarriesFrequencyFooter(plan) ? FREQUENCY_FOOTER_HTML : ''
}
