// Public, controlled campaign identifiers. Private labels never become URL parameters.
export const CAMPAIGN_SOURCES = {
  email: { label: 'Email', medium: 'email' },
  qr_scan: { label: 'QR / printed material', medium: 'qr' },
  partner: { label: 'Partner referral', medium: 'referral' },
  google: { label: 'Google paid campaign', medium: 'cpc' },
  instagram: { label: 'Instagram organic', medium: 'social' },
  facebook: { label: 'Facebook organic', medium: 'social' },
} as const
export const CAMPAIGN_LANDINGS = {
  '/': 'Frequency home',
  '/discover': 'Discover',
  '/create-a-space': 'Create a Space',
  '/join': 'Join Frequency',
} as const
export type CampaignSource = keyof typeof CAMPAIGN_SOURCES
export type CampaignLanding = keyof typeof CAMPAIGN_LANDINGS
export function isCampaignSource(value: string): value is CampaignSource { return Object.hasOwn(CAMPAIGN_SOURCES, value) }
export function isCampaignLanding(value: string): value is CampaignLanding { return Object.hasOwn(CAMPAIGN_LANDINGS, value) }

/** The opaque ID joins Google and first-party reports without revealing the operator's label. */
export function buildCampaignLink(input: { id: string; source: CampaignSource; landing: CampaignLanding; privateLabel: string }) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.id) || !isCampaignSource(input.source) || !isCampaignLanding(input.landing)) throw new Error('Invalid campaign configuration')
  const url = new URL(input.landing, 'https://frequencylocal.com')
  const medium = CAMPAIGN_SOURCES[input.source].medium
  url.searchParams.set('utm_source', input.source)
  url.searchParams.set('utm_medium', medium)
  url.searchParams.set('utm_campaign', input.id)
  return {
    url: url.toString(),
    mapping: { campaignId: input.id, privateLabel: input.privateLabel.trim().slice(0, 80), source: input.source, medium, landing: input.landing },
  }
}
