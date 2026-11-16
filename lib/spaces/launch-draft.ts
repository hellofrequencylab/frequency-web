// THE LAUNCH DRAFT (SCAN-1219), the one reader of `preferences.launchDraft`. Review and Publish keeps the person's
// website words and first email here while it hands them on, then records which Space email draft it made so a second
// Publish never makes a second one. PURE and tolerant: any shape reads as "nothing kept".

export interface LaunchDraftKept {
  website: { headline: string; intro: string }
  email: { subject: string; body: string }
  /** The Space email draft (campaigns.id) the first email was handed to. Empty until it was. */
  emailCampaignId: string
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/** What Review and Publish kept on a Space's preferences blob. */
export function readLaunchDraft(preferences: unknown): LaunchDraftKept {
  const kept = record(record(preferences).launchDraft)
  const website = record(kept.website)
  const email = record(kept.email)
  return {
    website: { headline: text(website.headline), intro: text(website.intro) },
    email: { subject: text(email.subject), body: text(email.body) },
    emailCampaignId: text(kept.emailCampaignId),
  }
}
