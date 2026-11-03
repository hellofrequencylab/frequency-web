import type { NewWorldKitNiche } from './new-world-variants'

interface NewWorldKitSummary { id: string; niche: NewWorldKitNiche; theme: 'NewWorld'; label: string; description: string }

/** New World's seven kits for the editor's kit library (the General template and the six niche doors), `new-world-<niche>`.
 *  Kept apart from new-world-variants.ts so listing them does not load the kits' copy, and apart from KIT_INDEX until the theme is
 *  registered (LIVE-2056). new-world-variants.test.ts pins every row to its kit. */
export const NEW_WORLD_KIT_INDEX: readonly NewWorldKitSummary[] = [
  { id: 'new-world-general', niche: 'general', theme: 'NewWorld', label: 'Your place', description: 'A page for whatever you run: what happens here, who it is for and a way to come along.' },
  { id: 'new-world-coaches', niche: 'coaches', theme: 'NewWorld', label: 'Coaches', description: 'Groups with a coach in each, a calendar people can book from and a first session that is free.' },
  { id: 'new-world-studios', niche: 'studios', theme: 'NewWorld', label: 'Studios', description: 'Small classes, a schedule people book from and memberships that pause when life does.' },
  { id: 'new-world-hosts', niche: 'hosts', theme: 'NewWorld', label: 'Hosts', description: 'A table, a date and seats people can save: menus, dates, a waitlist and a first supper that feels easy.' },
  { id: 'new-world-venues', niche: 'venues', theme: 'NewWorld', label: 'Venues', description: 'The room, what is on this week and tickets people can buy before the doors open.' },
  { id: 'new-world-nonprofits', niche: 'nonprofits', theme: 'NewWorld', label: 'Non-profits', description: 'The work explained plainly, crews to join, a calendar the neighbourhood reads and an easy way to give.' },
  { id: 'new-world-networks', niche: 'networks', theme: 'NewWorld', label: 'Networks', description: 'Many groups under one roof: find yours, start one and see what is on everywhere.' },
]
