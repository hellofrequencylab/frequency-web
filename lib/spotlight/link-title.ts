// A FIRST TITLE FOR A PASTED LINK (LIVE-2454). The owner pastes an address and the row fills a title they can
// keep or change: the network's own name for the big ones, else the site's address. Pure.

const NAMES: ReadonlyArray<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)(x\.com|twitter\.com)$/, 'X'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)threads\.(net|com)$/, 'Threads'],
  [/(^|\.)spotify\.com$/, 'Spotify'],
  [/(^|\.)substack\.com$/, 'Substack'],
  [/(^|\.)patreon\.com$/, 'Patreon'],
  [/(^|\.)pinterest\.com$/, 'Pinterest'],
  [/(^|\.)soundcloud\.com$/, 'SoundCloud'],
]

/** The title a pasted link starts with, or '' when the address cannot be read yet. */
export function suggestLinkTitle(url: string): string {
  let host: string
  try {
    host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
  if (!host.includes('.')) return ''
  for (const [re, name] of NAMES) if (re.test(host)) return name
  return host
}
