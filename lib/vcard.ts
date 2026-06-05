// Member-controlled contact card. The config (sanitized by parseVcard) lives on
// profiles.vcard; buildVcf turns the public profile + the member's opted-in fields
// into a .vcf string. Pure + isomorphic — unit-tests cleanly. Permissions = the
// member only fills/enables what they want shared; nothing else reaches the card.

export interface VcardConfig {
  /** Offer a "Save contact" vCard at all. */
  enabled: boolean
  email: string | null
  phone: string | null
  org: string | null
  title: string | null
  website: string | null
  /** Embed the avatar (https only) as the card PHOTO. */
  includeAvatar: boolean
}

export const DEFAULT_VCARD: VcardConfig = {
  enabled: false,
  email: null,
  phone: null,
  org: null,
  title: null,
  website: null,
  includeAvatar: true,
}

function str(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Coerce arbitrary stored/edited JSON into a valid, safe VcardConfig. */
export function parseVcard(raw: unknown): VcardConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const email = str(r.email, 254)
  let website = str(r.website, 300)
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`
  return {
    enabled: r.enabled === true,
    email: email && EMAIL_RE.test(email) ? email : null,
    phone: str(r.phone, 40),
    org: str(r.org),
    title: str(r.title),
    website,
    includeAvatar: r.includeAvatar !== false,
  }
}

// vCard 3.0 text escaping.
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export interface VcardProfile {
  displayName: string
  handle: string
  bio: string | null
  avatarUrl: string | null
  profileUrl: string
}

/** Build a vCard 3.0 (.vcf) string from the profile + permissioned config; only
 *  opted-in fields are included. Returns null when the card is disabled. */
export function buildVcf(profile: VcardProfile, config: VcardConfig): string | null {
  if (!config.enabled) return null
  const name = profile.displayName || profile.handle
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${esc(name)}`,
    `N:;${esc(name)};;;`,
    `NICKNAME:${esc(profile.handle)}`,
    `URL:${esc(profile.profileUrl)}`,
  ]
  if (config.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(config.email)}`)
  if (config.phone) lines.push(`TEL;TYPE=CELL:${esc(config.phone)}`)
  if (config.org) lines.push(`ORG:${esc(config.org)}`)
  if (config.title) lines.push(`TITLE:${esc(config.title)}`)
  if (config.website) lines.push(`URL:${esc(config.website)}`)
  if (config.includeAvatar && profile.avatarUrl && /^https:\/\//i.test(profile.avatarUrl)) {
    lines.push(`PHOTO;VALUE=URI:${esc(profile.avatarUrl)}`)
  }
  if (profile.bio) lines.push(`NOTE:${esc(profile.bio)}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}
