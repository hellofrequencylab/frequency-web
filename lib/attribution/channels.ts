// Acquisition channels — the governed taxonomy of HOW a member/lead first reached
// us (ADR-095). Client-safe and pure (no imports), so middleware, server actions,
// and admin UI can all share one source of truth.
//
// Each channel maps 1:1 to a registry tag `source_<channel>` (lib/traits/registry.ts),
// stamped on the member at signup so the founding cohort stays segmentable by origin
// forever — the same pattern as the beta_* cohort tags. The richer first/last-touch
// detail (utm, referrer, landing) rides profiles.meta.acquisition / contacts.meta.

export const ACQUISITION_CHANNELS = [
  'donor',        // gave money / sponsorship / partnership (flow not built yet — plumbing only)
  'referral',     // a person sent them — invite link or a member's referral/QR code
  'qr_scan',      // scanned a QR code (marketing or personal)
  'event_guest',  // arrived from an event page / guest touchpoint
  'video',        // a video on-ramp (YouTube etc. — the early-adopter sequence's path)
  'social',       // social platforms (IG, TikTok, X, Facebook, LinkedIn, Reddit…)
  'search',       // search engines (organic)
  'email',        // an email / newsletter link
  'organic',      // an external site referrer that isn't search/social
  'direct',       // typed the URL / no referrer, no campaign
] as const

export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number]

/** Human label for admin + analytics. */
export const CHANNEL_LABEL: Record<AcquisitionChannel, string> = {
  donor: 'Donor',
  referral: 'Referral',
  qr_scan: 'QR scan',
  event_guest: 'Event guest',
  video: 'Video',
  social: 'Social',
  search: 'Search',
  email: 'Email',
  organic: 'Organic',
  direct: 'Direct',
}

/** The governed registry tag key for a channel (e.g. 'qr_scan' → 'source_qr_scan'). */
export function channelTag(channel: AcquisitionChannel): string {
  return `source_${channel}`
}

export function isChannel(value: string): value is AcquisitionChannel {
  return (ACQUISITION_CHANNELS as readonly string[]).includes(value)
}

// ── Host → channel hints (used to classify a referrer URL) ───────────────────
const SEARCH_HOSTS = ['google.', 'bing.', 'duckduckgo.', 'yahoo.', 'ecosia.', 'baidu.', 'yandex.']
const SOCIAL_HOSTS = [
  'instagram.', 'tiktok.', 'twitter.', 'x.com', 't.co', 'facebook.', 'fb.com', 'fb.me',
  'linkedin.', 'lnkd.in', 'reddit.', 'threads.', 'youtube.', 'youtu.be', 'pinterest.', 'snapchat.',
]
const VIDEO_HOSTS = ['youtube.', 'youtu.be']

function hostMatches(host: string, needles: string[]): boolean {
  return needles.some((n) => host.includes(n))
}

/**
 * Derive the canonical channel from a first-touch record (landing path + utm +
 * referrer). Pure + deterministic so middleware and the server agree. Priority:
 * explicit entry route > utm > referrer host > direct.
 */
export function deriveChannel(touch: {
  landing?: string | null
  ref?: string | null
  utm?: { source?: string | null; medium?: string | null } | null
}): AcquisitionChannel {
  const landing = (touch.landing ?? '').toLowerCase()
  // Entry route is the strongest signal — they literally arrived on it.
  if (landing.startsWith('/q/') || landing === '/q') return 'qr_scan'
  if (landing.startsWith('/join/')) return 'referral'
  if (landing.startsWith('/events/')) return 'event_guest'
  if (landing.startsWith('/give') || landing.startsWith('/donate')) return 'donor'

  const medium = (touch.utm?.medium ?? '').toLowerCase()
  const source = (touch.utm?.source ?? '').toLowerCase()
  if (medium === 'email' || source.includes('newsletter') || source.includes('email')) return 'email'
  if (medium === 'video' || source.includes('youtube') || source === 'yt') return 'video'
  if (['social', 'cpc', 'paid-social', 'paid_social', 'ppc'].includes(medium)) return 'social'
  if (['instagram', 'ig', 'tiktok', 'twitter', 'x', 'facebook', 'fb', 'linkedin', 'reddit', 'threads', 'pinterest', 'snapchat'].includes(source)) return 'social'
  if (medium === 'referral') return 'referral'
  if (['google', 'bing', 'duckduckgo', 'yahoo', 'ecosia', 'baidu', 'yandex'].includes(source)) return 'search'

  const host = referrerHost(touch.ref)
  if (host) {
    if (hostMatches(host, VIDEO_HOSTS)) return 'video'
    if (hostMatches(host, SEARCH_HOSTS)) return 'search'
    if (hostMatches(host, SOCIAL_HOSTS)) return 'social'
    return 'organic' // some other external site sent them
  }

  // No campaign, no referrer (and not an external referrer we recognised).
  if (!touch.utm?.source && !touch.utm?.medium && !touch.ref) return 'direct'
  return 'organic'
}

/** Lowercased hostname of a referrer URL, or null if absent/unparseable. */
export function referrerHost(ref: string | null | undefined): string | null {
  if (!ref) return null
  try {
    return new URL(ref).hostname.toLowerCase()
  } catch {
    return null
  }
}
