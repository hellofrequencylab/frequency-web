import type { KitNiche, SiteKit } from './types'

// Kit CONTENT is loaded on demand, only by the editor and the apply step. The public site never imports
// this file, so kit copy is not traced into every hosted route (DEPLOY-SAFETY: shared-module fan-out).
const LOADERS: Record<string, () => Promise<SiteKit>> = {
  'midnight-coaches': () => import('./midnight-variants').then((m) => m.midnightKit('coaches')),
  'midnight-studios': () => import('./midnight-variants').then((m) => m.midnightKit('studios')),
  'midnight-hosts': () => import('./midnight-variants').then((m) => m.midnightKit('hosts')),
  'midnight-venues': () => import('./midnight-variants').then((m) => m.midnightKit('venues')),
  'midnight-nonprofits': () => import('./midnight-variants').then((m) => m.midnightKit('nonprofits')),
  'midnight-networks': () => import('./midnight-variants').then((m) => m.midnightKit('networks')),
  'default-coaches': () => import('./default-variants').then((m) => m.defaultKit('coaches')),
  'default-studios': () => import('./default-variants').then((m) => m.defaultKit('studios')),
  'default-hosts': () => import('./default-variants').then((m) => m.defaultKit('hosts')),
  'default-venues': () => import('./default-variants').then((m) => m.defaultKit('venues')),
  'default-nonprofits': () => import('./default-variants').then((m) => m.defaultKit('nonprofits')),
  'default-networks': () => import('./default-variants').then((m) => m.defaultKit('networks')),
  'wildheart-coaches': () => import('./wildheart-coaches').then((m) => m.default),
}

interface KitSummary { id: string; niche: KitNiche; theme: SiteKit['theme']; label: string; description: string }

/** Light index for the library screen; no page content. */
export const KIT_INDEX: readonly KitSummary[] = [
  { id: 'midnight-coaches', niche: 'coaches', theme: 'Midnight', label: 'Coaches and healers', description: 'A calm first page, your ways to work together, and an easy way to book.' },
  { id: 'midnight-studios', niche: 'studios', theme: 'Midnight', label: 'Studios', description: 'Classes, a simple schedule and memberships people can join in a minute.' },
  { id: 'midnight-hosts', niche: 'hosts', theme: 'Midnight', label: 'Event hosts', description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.' },
  { id: 'midnight-venues', niche: 'venues', theme: 'Midnight', label: 'Venues', description: 'Show the room, what is on and how to book it.' },
  { id: 'midnight-nonprofits', niche: 'nonprofits', theme: 'Midnight', label: 'Nonprofits', description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.' },
  { id: 'midnight-networks', niche: 'networks', theme: 'Midnight', label: 'Networks', description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.' },
  { id: 'default-coaches', niche: 'coaches', theme: 'DAWN', label: 'Coaches and healers', description: 'A calm first page, your ways to work together, and an easy way to book.' },
  { id: 'default-studios', niche: 'studios', theme: 'DAWN', label: 'Studios', description: 'Classes, a simple schedule and memberships people can join in a minute.' },
  { id: 'default-hosts', niche: 'hosts', theme: 'DAWN', label: 'Event hosts', description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.' },
  { id: 'default-venues', niche: 'venues', theme: 'DAWN', label: 'Venues', description: 'Show the room, what is on and how to book it.' },
  { id: 'default-nonprofits', niche: 'nonprofits', theme: 'DAWN', label: 'Nonprofits', description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.' },
  { id: 'default-networks', niche: 'networks', theme: 'DAWN', label: 'Networks', description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.' },
  { id: 'wildheart-coaches', niche: 'coaches', theme: 'Wildheart', label: 'Coaches and healers', description: 'Your story, how you work, what you offer and a way to book.' },
]

export async function loadKit(id: string): Promise<SiteKit | null> {
  const load = Object.hasOwn(LOADERS, id) ? LOADERS[id] : undefined
  return load ? load() : null
}
