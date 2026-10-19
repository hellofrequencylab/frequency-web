// A plain-text Space campaign, drip step or event broadcast as a branded email (EMAIL-024). The composer,
// the scheduled-send cron, the drip cron and the event hub's Email channel all render through here, so a
// Space's plain-text mail wears the same Studio shell as its block campaigns: the Space's own palette and
// wordmark when the caller passes its brand, the Frequency shell otherwise, the full CAN-SPAM footer with
// the per-Space unsubscribe placeholder the send seam swaps per recipient, and the quiet "Sent with
// Frequency" line on a free plan (ADR-1709, LIVE-751).
import { plainTextEmail, type EmailBrand } from '@/lib/email-studio/shell'
import { SPACE_UNSUBSCRIBE_PLACEHOLDER } from '@/lib/spaces/email'

export interface CampaignHtmlOptions {
  /** The Space's email brand (lib/spaces/email-colors.ts spaceEmailBrand); absent renders the Frequency shell. */
  brand?: EmailBrand
  /** A free Space's campaign carries the "Sent with Frequency" line (campaignCarriesFrequencyFooter). */
  sentWithFrequency?: boolean
}

/** The send-ready HTML for a plain-text body. Exported for the event broadcast action too (the event hub's
 *  Email channel rides this same render + send seam, so a campaign body looks identical whichever surface
 *  sent it). */
export function renderCampaignHtml(body: string, opts: CampaignHtmlOptions = {}): string {
  return plainTextEmail(body, {
    unsubscribeUrl: SPACE_UNSUBSCRIBE_PLACEHOLDER,
    brand: opts.brand,
    sentWithFrequency: opts.sentWithFrequency,
    audienceLine: 'You are receiving this because you are a contact of this space.',
  }).html
}
