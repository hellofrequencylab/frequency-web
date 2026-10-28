import { MEGA_PROFILE_NICHES, MEGA_THEMES, type MegaThemeId } from '@/lib/theme/mega-theme'
import { NICHE_SPECS } from './niche-spec'
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
  'network-coaches': () => import('./network-variants').then((m) => m.networkKit('coaches')),
  'network-studios': () => import('./network-variants').then((m) => m.networkKit('studios')),
  'network-hosts': () => import('./network-variants').then((m) => m.networkKit('hosts')),
  'network-venues': () => import('./network-variants').then((m) => m.networkKit('venues')),
  'network-nonprofits': () => import('./network-variants').then((m) => m.networkKit('nonprofits')),
  'network-networks': () => import('./network-variants').then((m) => m.networkKit('networks')),
  'default-coaches': () => import('./default-variants').then((m) => m.defaultKit('coaches')),
  'default-studios': () => import('./default-variants').then((m) => m.defaultKit('studios')),
  'default-hosts': () => import('./default-variants').then((m) => m.defaultKit('hosts')),
  'default-venues': () => import('./default-variants').then((m) => m.defaultKit('venues')),
  'default-nonprofits': () => import('./default-variants').then((m) => m.defaultKit('nonprofits')),
  'default-networks': () => import('./default-variants').then((m) => m.defaultKit('networks')),
  'bold-coaches': () => import('./bold-variants').then((m) => m.boldKit('coaches')),
  'bold-studios': () => import('./bold-variants').then((m) => m.boldKit('studios')),
  'bold-hosts': () => import('./bold-variants').then((m) => m.boldKit('hosts')),
  'bold-venues': () => import('./bold-variants').then((m) => m.boldKit('venues')),
  'bold-nonprofits': () => import('./bold-variants').then((m) => m.boldKit('nonprofits')),
  'bold-networks': () => import('./bold-variants').then((m) => m.boldKit('networks')),
  'temple-coaches': () => import('./temple-variants').then((m) => m.templeKit('coaches')),
  'temple-studios': () => import('./temple-variants').then((m) => m.templeKit('studios')),
  'temple-hosts': () => import('./temple-variants').then((m) => m.templeKit('hosts')),
  'temple-venues': () => import('./temple-variants').then((m) => m.templeKit('venues')),
  'temple-nonprofits': () => import('./temple-variants').then((m) => m.templeKit('nonprofits')),
  'temple-networks': () => import('./temple-variants').then((m) => m.templeKit('networks')),
  'designer-coaches': () => import('./designer-variants').then((m) => m.designerKit('coaches')),
  'designer-studios': () => import('./designer-variants').then((m) => m.designerKit('studios')),
  'designer-hosts': () => import('./designer-variants').then((m) => m.designerKit('hosts')),
  'designer-venues': () => import('./designer-variants').then((m) => m.designerKit('venues')),
  'designer-nonprofits': () => import('./designer-variants').then((m) => m.designerKit('nonprofits')),
  'designer-networks': () => import('./designer-variants').then((m) => m.designerKit('networks')),
  'wildheart-coaches': () => import('./wildheart-coaches').then((m) => m.default),
  'wildheart-studios': () => import('./wildheart-variants').then((m) => m.wildheartKit('studios')),
  'wildheart-hosts': () => import('./wildheart-variants').then((m) => m.wildheartKit('hosts')),
  'wildheart-venues': () => import('./wildheart-variants').then((m) => m.wildheartKit('venues')),
  'wildheart-nonprofits': () => import('./wildheart-variants').then((m) => m.wildheartKit('nonprofits')),
  'wildheart-networks': () => import('./wildheart-variants').then((m) => m.wildheartKit('networks')),
}

// The profile niches (general, creators, ...): every theme has a kit per profile. Default, Bold and Designer lay the
// niche's words out themselves; the four hand-laid themes use profile-variants.ts. Ids are `<prefix>-<niche>`.
const PROFILE_BUILDERS: { prefix: string; mega: MegaThemeId; build: (niche: KitNiche) => Promise<SiteKit> }[] = [
  { prefix: 'default', mega: 'frequency', build: (n) => import('./default-variants').then((m) => m.defaultKit(n)) },
  { prefix: 'bold', mega: 'bold', build: (n) => import('./bold-variants').then((m) => m.boldKit(n)) },
  { prefix: 'designer', mega: 'designer', build: (n) => import('./designer-variants').then((m) => m.designerKit(n)) },
  { prefix: 'midnight', mega: 'midnight', build: (n) => import('./profile-variants').then((m) => m.profileKit('Midnight', n)) },
  { prefix: 'network', mega: 'network', build: (n) => import('./profile-variants').then((m) => m.profileKit('Network', n)) },
  { prefix: 'temple', mega: 'temple', build: (n) => import('./profile-variants').then((m) => m.profileKit('Temple', n)) },
  { prefix: 'wildheart', mega: 'wildheart', build: (n) => import('./profile-variants').then((m) => m.profileKit('Wildheart', n)) },
]
const PROFILE_THEMES = PROFILE_BUILDERS.map((b) => ({ ...b, theme: MEGA_THEMES.find((m) => m.id === b.mega)!.editor }))
// The General kit also carries the email sign-up page ("Join the list"), published with the site.
const withJoinPage = async (kit: SiteKit, niche: KitNiche): Promise<SiteKit> =>
  niche === 'general' ? { ...kit, pages: [...kit.pages, (await import('./profile-variants')).joinListPage(kit.theme)] } : kit
for (const t of PROFILE_THEMES) for (const niche of MEGA_PROFILE_NICHES) LOADERS[`${t.prefix}-${niche}`] = () => t.build(niche).then((k) => withJoinPage(k, niche))

// The Designer Theme Kit's thirteen profile kits (the design system's own profiles: interior designers, architects, ...),
// beside the six niche doors. Id is `designer-profile-<id>`; the id is also the kit's niche.
const DESIGNER_PROFILE_IDS = ['general', 'coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks', 'creators', 'schools', 'clubs', 'faith', 'wellness', 'markets'] as const
for (const niche of DESIGNER_PROFILE_IDS) LOADERS[`designer-profile-${niche}`] = () => import('./designer-profile-variants').then((m) => m.designerProfileKit(niche))

interface KitSummary { id: string; niche: KitNiche; theme: SiteKit['theme']; label: string; description: string }

/** Light index for the library screen; no page content. */
export const KIT_INDEX: readonly KitSummary[] = [
  { id: 'midnight-coaches', niche: 'coaches', theme: 'Midnight', label: 'Coaches and healers', description: 'A calm first page, your ways to work together, and an easy way to book.' },
  { id: 'midnight-studios', niche: 'studios', theme: 'Midnight', label: 'Studios', description: 'Classes, a simple schedule and memberships people can join in a minute.' },
  { id: 'midnight-hosts', niche: 'hosts', theme: 'Midnight', label: 'Event hosts', description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.' },
  { id: 'midnight-venues', niche: 'venues', theme: 'Midnight', label: 'Venues', description: 'Show the room, what is on and how to book it.' },
  { id: 'midnight-nonprofits', niche: 'nonprofits', theme: 'Midnight', label: 'Nonprofits', description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.' },
  { id: 'midnight-networks', niche: 'networks', theme: 'Midnight', label: 'Networks', description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.' },
  { id: 'network-coaches', niche: 'coaches', theme: 'Network', label: 'Coaches and healers', description: 'A warm first page, your ways to work together, and an easy way to book.' },
  { id: 'network-studios', niche: 'studios', theme: 'Network', label: 'Studios', description: 'Classes, a simple schedule and memberships people can join in a minute.' },
  { id: 'network-hosts', niche: 'hosts', theme: 'Network', label: 'Event hosts', description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.' },
  { id: 'network-venues', niche: 'venues', theme: 'Network', label: 'Venues', description: 'Show the room, what is on and how to book it.' },
  { id: 'network-nonprofits', niche: 'nonprofits', theme: 'Network', label: 'Nonprofits', description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.' },
  { id: 'network-networks', niche: 'networks', theme: 'Network', label: 'Networks', description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.' },
  { id: 'default-coaches', niche: 'coaches', theme: 'DAWN', label: 'Coaches and healers', description: 'A calm first page, your ways to work together, and an easy way to book.' },
  { id: 'default-studios', niche: 'studios', theme: 'DAWN', label: 'Studios', description: 'Classes, a simple schedule and memberships people can join in a minute.' },
  { id: 'default-hosts', niche: 'hosts', theme: 'DAWN', label: 'Event hosts', description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.' },
  { id: 'default-venues', niche: 'venues', theme: 'DAWN', label: 'Venues', description: 'Show the room, what is on and how to book it.' },
  { id: 'default-nonprofits', niche: 'nonprofits', theme: 'DAWN', label: 'Nonprofits', description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.' },
  { id: 'default-networks', niche: 'networks', theme: 'DAWN', label: 'Networks', description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.' },
  { id: 'bold-coaches', niche: 'coaches', theme: 'Menswork', label: 'Coaches and healers', description: 'A calm first page, your ways to work together, and an easy way to book.' },
  { id: 'bold-studios', niche: 'studios', theme: 'Menswork', label: 'Studios', description: 'Classes, a simple schedule and memberships people can join in a minute.' },
  { id: 'bold-hosts', niche: 'hosts', theme: 'Menswork', label: 'Event hosts', description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.' },
  { id: 'bold-venues', niche: 'venues', theme: 'Menswork', label: 'Venues', description: 'Show the room, what is on and how to book it.' },
  { id: 'bold-nonprofits', niche: 'nonprofits', theme: 'Menswork', label: 'Nonprofits', description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.' },
  { id: 'bold-networks', niche: 'networks', theme: 'Menswork', label: 'Networks', description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.' },
  { id: 'temple-coaches', niche: 'coaches', theme: 'Temple', label: 'Coaches and healers', description: 'A warm first page, your ways to work together, and an easy way to book.' },
  { id: 'temple-studios', niche: 'studios', theme: 'Temple', label: 'Studios', description: 'Classes, a simple schedule and memberships people can join in a minute.' },
  { id: 'temple-hosts', niche: 'hosts', theme: 'Temple', label: 'Event hosts', description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.' },
  { id: 'temple-venues', niche: 'venues', theme: 'Temple', label: 'Venues', description: 'Show the room, what is on and how to book it.' },
  { id: 'temple-nonprofits', niche: 'nonprofits', theme: 'Temple', label: 'Nonprofits', description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.' },
  { id: 'temple-networks', niche: 'networks', theme: 'Temple', label: 'Networks', description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.' },
  { id: 'designer-coaches', niche: 'coaches', theme: 'Designer', label: 'Coaches and healers', description: 'A calm first page, your ways to work together, and an easy way to book.' },
  { id: 'designer-studios', niche: 'studios', theme: 'Designer', label: 'Studios', description: 'Classes, a simple schedule and memberships people can join in a minute.' },
  { id: 'designer-hosts', niche: 'hosts', theme: 'Designer', label: 'Event hosts', description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.' },
  { id: 'designer-venues', niche: 'venues', theme: 'Designer', label: 'Venues', description: 'Show the room, what is on and how to book it.' },
  { id: 'designer-nonprofits', niche: 'nonprofits', theme: 'Designer', label: 'Nonprofits', description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.' },
  { id: 'designer-networks', niche: 'networks', theme: 'Designer', label: 'Networks', description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.' },
  { id: 'wildheart-coaches', niche: 'coaches', theme: 'Wildheart', label: 'Coaches and healers', description: 'Your story, how you work, what you offer and a way to book.' },
  { id: 'wildheart-studios', niche: 'studios', theme: 'Wildheart', label: 'Studios', description: 'Classes, a simple schedule and a first visit that feels easy.' },
  { id: 'wildheart-hosts', niche: 'hosts', theme: 'Wildheart', label: 'Event hosts', description: 'A home for your gatherings: what is coming up, how to join and how to stay in touch.' },
  { id: 'wildheart-venues', niche: 'venues', theme: 'Wildheart', label: 'Venues', description: 'Show the room, what is on and how to book it.' },
  { id: 'wildheart-nonprofits', niche: 'nonprofits', theme: 'Wildheart', label: 'Nonprofits', description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.' },
  { id: 'wildheart-networks', niche: 'networks', theme: 'Wildheart', label: 'Networks', description: 'One home for many places: find a chapter, start one, and see what is on everywhere.' },
]

/** The same index for the profile niches (general, creators, ...), every theme. Kept apart so the six-door index above stays the one each theme's own tests pin. */
export const PROFILE_KIT_INDEX: readonly KitSummary[] = PROFILE_THEMES.flatMap((t) =>
  MEGA_PROFILE_NICHES.map((niche) => ({ id: `${t.prefix}-${niche}`, niche, theme: t.theme, label: NICHE_SPECS[niche].label, description: NICHE_SPECS[niche].description })),
)

export { DESIGNER_PROFILE_KIT_INDEX } from './designer-profile-index'

export async function loadKit(id: string): Promise<SiteKit | null> {
  const load = Object.hasOwn(LOADERS, id) ? LOADERS[id] : undefined
  return load ? load() : null
}
